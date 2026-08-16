import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, sql } from "@/core/db/client";
import type { AiToolDef } from "@/core/modules/types.server";
import { TYPE_DEFAULT_EXECUTOR } from "./defaults";
import { openPullRequest } from "./git";
import { TASK_TYPES, taskAttempts, workbenchTasks } from "./schema";

/**
 * Delegation as a tool: chat and agents can hand work to the Workbench
 * instead of trying to do long jobs inside their own turn limit.
 */
export const workbenchTools: AiToolDef[] = [
  {
    name: "workbench.delegate",
    description:
      "Delegate a one-off task to a background executor (research, code, docs). Returns immediately with a task id; the work happens unattended and the user reviews it in the Workbench. Use for anything that needs more than a couple of tool calls.",
    input: z.object({
      prompt: z
        .string()
        .min(10)
        .describe("The full instruction for the executor, self-contained."),
      taskType: z.enum(TASK_TYPES).describe("research | code | docs | custom"),
      repoPath: z
        .string()
        .optional()
        .describe("Absolute repo path — required for code tasks."),
    }),
    execute: async (i: {
      prompt: string;
      taskType: (typeof TASK_TYPES)[number];
      repoPath?: string;
    }) => {
      const first = i.prompt.trim().split("\n")[0].slice(0, 88);
      const [task] = await db
        .insert(workbenchTasks)
        .values({
          title: first,
          prompt: i.prompt.trim(),
          taskType: i.taskType,
          repoPath: i.repoPath ?? null,
          createdFrom: "ai",
        })
        .returning();
      const [attempt] = await db
        .insert(taskAttempts)
        .values({
          taskId: task.id,
          seq: 1,
          executorId: TYPE_DEFAULT_EXECUTOR[i.taskType],
        })
        .returning();
      await sql.notify("workbench_run", attempt.id);
      return { taskId: task.id, status: "queued", url: `/m/workbench/${task.id}` };
    },
  },
  {
    name: "workbench.openPR",
    description:
      "Open a pull request for a Workbench task's branch — push the branch to GitHub and create the PR. This is an outward action: it is queued for the user's approval and pushes only once approved. Never merges.",
    input: z.object({
      taskId: z.string().uuid(),
      title: z.string().min(1).describe("PR title"),
      body: z.string().describe("PR description (markdown)"),
      prBranch: z
        .string()
        .optional()
        .describe("Stable head branch to reuse (a routine coalesces onto one)"),
      routineId: z.string().uuid().optional(),
    }),
    risk: "approval",
    execute: async (i: {
      taskId: string;
      title: string;
      body: string;
      prBranch?: string;
      routineId?: string;
    }) => {
      const [task] = await db
        .select()
        .from(workbenchTasks)
        .where(eq(workbenchTasks.id, i.taskId));
      if (!task) return { error: "task not found" };
      if (!task.repoPath) return { error: "task has no repo — nothing to PR" };
      const [attempt] = await db
        .select()
        .from(taskAttempts)
        .where(eq(taskAttempts.taskId, i.taskId))
        .orderBy(desc(taskAttempts.seq))
        .limit(1);
      if (!attempt?.branch) return { error: "no branch on the latest attempt" };
      try {
        const { url, slug, updated } = await openPullRequest({
          repoPath: task.repoPath,
          branch: attempt.branch,
          title: i.title,
          body: i.body,
          // A routine reuses one stable branch → force-push regenerates it, and
          // the open PR is updated instead of a duplicate being opened.
          prBranch: i.prBranch,
          force: !!i.prBranch,
        });
        await db
          .update(workbenchTasks)
          .set({ prUrl: url || null, updatedAt: new Date() })
          .where(eq(workbenchTasks.id, i.taskId));
        await sql.notify("workbench_changed", i.taskId);
        if (i.routineId) {
          const { routines } = await import("./schema");
          await db
            .update(routines)
            .set({ prUrl: url || null, updatedAt: new Date() })
            .where(eq(routines.id, i.routineId));
          await sql.notify("routines_changed", i.routineId);
        }
        return { opened: !updated, updated, url, repo: slug };
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    },
  },
  {
    name: "workbench.list",
    description:
      "List recent Workbench tasks with their status and result summary.",
    input: z.object({
      status: z.string().optional().describe("Filter, e.g. 'review' or 'running'."),
      limit: z.number().int().min(1).max(50).optional(),
    }),
    execute: async (i: { status?: string; limit?: number }) => {
      const rows = await db
        .select()
        .from(workbenchTasks)
        .orderBy(desc(workbenchTasks.createdAt))
        .limit(i.limit ?? 15);
      return rows
        .filter((r) => !i.status || r.status === i.status)
        .map((r) => ({
          id: r.id,
          title: r.title,
          type: r.taskType,
          status: r.status,
          summary: r.summary?.slice(0, 400) ?? null,
        }));
    },
  },
  {
    name: "workbench.get",
    description:
      "Read one Workbench task in full: prompt, status, result and attempt history.",
    input: z.object({ taskId: z.string().uuid() }),
    execute: async (i: { taskId: string }) => {
      const [task] = await db
        .select()
        .from(workbenchTasks)
        .where(eq(workbenchTasks.id, i.taskId));
      if (!task) return { error: "not found" };
      const attempts = await db
        .select()
        .from(taskAttempts)
        .where(eq(taskAttempts.taskId, i.taskId));
      return {
        ...task,
        attempts: attempts.map((a) => ({
          seq: a.seq,
          executor: a.executorId,
          status: a.status,
          branch: a.branch,
          result: a.result?.slice(0, 2000) ?? null,
          error: a.error,
        })),
      };
    },
  },
  {
    name: "routine.create",
    risk: "approval",
    description:
      "Set up a RECURRING delegation (a routine): a standing ask that fires on a trigger — every new commit, a cron schedule, or both — against a project's attached repo, delivering changes as an approval-gated PR. Use to automate ongoing work (e.g. 'keep the docs in sync on every commit'). The project must have a repo attached.",
    input: z.object({
      name: z.string().min(1).describe("Short routine name"),
      projectId: z.string().uuid().describe("Project (must have a repo) from projects.list"),
      prompt: z.string().min(1).describe("The standing instruction run on each trigger"),
      triggerKind: z
        .enum(["commit", "schedule", "both"])
        .default("commit")
        .describe("What fires it: a new commit, a cron schedule, or both"),
      schedule: z
        .string()
        .optional()
        .describe("Cron expression, required when triggerKind includes 'schedule'"),
      model: z.string().optional().describe("Free model override; omit for the default"),
    }),
    async execute(input) {
      try {
        const { createRoutine } = await import("./actions");
        const row = await createRoutine({
          name: input.name,
          projectId: input.projectId,
          prompt: input.prompt,
          triggerKind: input.triggerKind,
          schedule: input.schedule ?? null,
          model: input.model ?? null,
        });
        return { created: { id: row.id, name: row.name, triggerKind: row.triggerKind } };
      } catch (e) {
        return { error: e instanceof Error ? e.message : String(e) };
      }
    },
  },
];
