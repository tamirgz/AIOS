import { execFile } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { eq } from "drizzle-orm";
import type { AiToolDef } from "@/core/modules/types.server";
import { getProjectCockpit } from "./queries";
import { usableRepoPath } from "./repo";
import { projectFiles, projects, PROJECT_HEALTHS, PROJECT_STATUSES } from "./schema";

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (d: Date | null) =>
  d === null ? null : Math.floor((Date.now() - d.getTime()) / DAY);

export const projectTools: AiToolDef[] = [
  {
    name: "projects.create",
    description:
      "Create a new project. Use for any multi-task effort the user wants to track.",
    input: z.object({
      name: z.string().min(1).describe("Short project name"),
      description: z
        .string()
        .optional()
        .describe("One-line summary of the project's goal"),
    }),
    async execute(input, { db }) {
      const [row] = await db
        .insert(projects)
        .values({
          name: input.name,
          description: input.description ?? null,
        })
        .returning();
      return { created: { id: row.id, name: row.name } };
    },
  },
  {
    name: "projects.list",
    description:
      "List projects with their L2 cockpit rollup: status, goal, next action, resolved health + reason, open/done/overdue task counts, and days since last activity. This is the world model — read it before deciding what needs attention.",
    input: z.object({}),
    async execute(_input, { db }) {
      const rows = await getProjectCockpit(db);
      return rows.map((p) => ({
        id: p.id,
        name: p.name,
        status: p.status,
        goal: p.goal,
        nextAction: p.nextAction,
        health: p.resolvedHealth.health,
        healthReason: p.resolvedHealth.reason,
        healthSource: p.resolvedHealth.source,
        tasks: {
          open: p.taskCounts.open,
          done: p.taskCounts.done,
          overdue: p.taskCounts.overdue,
        },
        notes: p.noteCount,
        daysSinceActivity: daysAgo(p.lastActivityAt),
      }));
    },
  },
  {
    name: "projects.setStatus",
    description:
      "Set a project's status (active | paused | done). Find the id via projects.list first.",
    input: z.object({
      id: z.string().uuid(),
      status: z.enum(PROJECT_STATUSES),
    }),
    async execute(input, { db }) {
      const [row] = await db
        .update(projects)
        .set({ status: input.status, updatedAt: new Date() })
        .where(eq(projects.id, input.id))
        .returning();
      return row
        ? { updated: { id: row.id, status: row.status } }
        : { error: "project not found" };
    },
  },
  {
    name: "projects.setHealth",
    description:
      "Record your judgement of a project's health with a one-line reason. Use 'blocked' when it's waiting on someone/something external (the read-time heuristic can never infer that). Prefer this over letting the heuristic guess. Find the id via projects.list.",
    input: z.object({
      id: z.string().uuid(),
      health: z.enum(PROJECT_HEALTHS),
      reason: z
        .string()
        .min(3)
        .max(120)
        .describe("One line: why this health, in plain words"),
    }),
    async execute(input, { db }) {
      // Deliberately does NOT touch updatedAt: the agent assessing a project is
      // not user activity, so it must not reset the stall clock.
      const [row] = await db
        .update(projects)
        .set({
          health: input.health,
          healthReason: input.reason.trim(),
          healthUpdatedAt: new Date(),
        })
        .where(eq(projects.id, input.id))
        .returning();
      return row
        ? { updated: { id: row.id, health: row.health } }
        : { error: "project not found" };
    },
  },
  {
    name: "projects.setGoal",
    description:
      "Set a project's north-star outcome (one line) when it has none, so the project has a clear 'why'. Don't overwrite a goal the user already wrote unless it's clearly wrong.",
    input: z.object({
      id: z.string().uuid(),
      goal: z.string().min(3).max(160),
    }),
    async execute(input, { db }) {
      const [row] = await db
        .update(projects)
        .set({ goal: input.goal.trim() })
        .where(eq(projects.id, input.id))
        .returning();
      return row
        ? { updated: { id: row.id, goal: row.goal } }
        : { error: "project not found" };
    },
  },
  {
    name: "projects.listFiles",
    description:
      "List the files attached to a project (filename, size, and whether their text was extracted). Use before answering questions about a project's specs/docs — search.everything already covers their content by meaning, this is for a direct inventory.",
    input: z.object({ projectId: z.string().uuid() }),
    async execute(input, { db }) {
      const rows = await db
        .select({
          id: projectFiles.id,
          filename: projectFiles.filename,
          sizeBytes: projectFiles.sizeBytes,
          status: projectFiles.status,
        })
        .from(projectFiles)
        .where(eq(projectFiles.projectId, input.projectId));
      return rows;
    },
  },
  {
    name: "projects.readRepo",
    description:
      "Read a project's attached code repo — recent commits + its README — so your advice is grounded in the actual code, not a guess. Returns attached:false when no repo is attached or it hasn't cloned yet.",
    input: z.object({ projectId: z.string().uuid() }),
    async execute(input, { db }) {
      const [p] = await db
        .select({ repoUrl: projects.repoUrl })
        .from(projects)
        .where(eq(projects.id, input.projectId));
      const dir = usableRepoPath(input.projectId, p?.repoUrl ?? null);
      if (!dir) return { attached: false, note: "no repo attached or not cloned yet" };
      const exec = promisify(execFile);
      let recentCommits = "";
      let readme = "";
      try {
        recentCommits = (
          await exec("git", ["-C", dir, "log", "--oneline", "-20"], {
            maxBuffer: 4 * 1024 * 1024,
          })
        ).stdout.trim();
      } catch {
        // shallow/odd repo — commits are optional context
      }
      try {
        const name = readdirSync(dir).find((n) => /^readme(\.md|\.rst|\.txt)?$/i.test(n));
        if (name) readme = readFileSync(join(dir, name), "utf8").slice(0, 4000);
      } catch {
        // no README — fine
      }
      return { attached: true, recentCommits, readme };
    },
  },
  {
    name: "projects.setAdvisorBrief",
    description:
      "Record the chief-of-staff read for ONE project: where it actually stands (state), the single real blocker (or null if none), and one concrete recommended next move. Ground every field in the project's real tasks/notes/repo — no boilerplate, no restating the goal.",
    input: z.object({
      projectId: z.string().uuid(),
      state: z
        .string()
        .min(3)
        .max(600)
        .describe("2-3 sentences: where this project actually stands right now"),
      blocker: z
        .string()
        .max(400)
        .nullish()
        .describe("The one real blocker holding it up, or null if nothing is blocking"),
      recommendation: z
        .string()
        .min(3)
        .max(400)
        .describe("One concrete next move you'd make"),
    }),
    async execute(input, { db }) {
      const [row] = await db
        .update(projects)
        .set({
          advisorState: input.state.trim(),
          advisorBlocker: input.blocker?.trim() || null,
          advisorNext: input.recommendation.trim(),
          advisorUpdatedAt: new Date(),
        })
        .where(eq(projects.id, input.projectId))
        .returning();
      return row ? { updated: { id: row.id } } : { error: "project not found" };
    },
  },
];
