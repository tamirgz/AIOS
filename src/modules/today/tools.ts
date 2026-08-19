import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/core/db/client";
import type { AiToolContext, AiToolDef } from "@/core/modules/types.server";
import { projects } from "@/modules/projects/schema";
import { resolveProjectTarget } from "@/modules/projects/subject";
import { insertAttentionItem } from "./core";
import { attentionItems, ATTENTION_TYPES } from "./schema";

/**
 * The chief-of-staff tools. Agents observe (read projects/day) and surface work
 * through the one atom (`attention.raise`) — the only way anything reaches the
 * "Needs you" queue. The trust gradient lives in the `type`: `approve` cards
 * never act on their own; `do`/`question`/`review` are proposals.
 */
export const todayTools: AiToolDef[] = [
  {
    name: "attention.raise",
    description:
      "Surface something that needs the user's attention as a card in the 'Needs you' queue. Deduplication is automatic — at most one open card per (project + title), so re-running, or another agent raising the same thing, never creates a duplicate; you don't need to manage a key. To anchor a card to a project, pass its NAME (or, in a focused agent run, it auto-anchors to the focused project) — never a raw id. Prefer 'notify' for FYIs, 'do' for a suggested next action, 'question' for a decision, 'approve' only when a real side-effect needs sign-off.",
    input: z.object({
      type: z.enum(ATTENTION_TYPES),
      title: z.string().min(3),
      body: z.string().optional(),
      project: z
        .string()
        .optional()
        .describe(
          "Project NAME to anchor to (resolved & validated server-side). In a focused agent run, omit it — the card anchors to the focused project automatically.",
        ),
      projectRef: z
        .string()
        .optional()
        .describe("(legacy) projects:<uuid>; prefer the 'project' name or the focused project"),
      urgency: z
        .number()
        .int()
        .min(0)
        .max(100)
        .optional()
        .describe("higher = more urgent; 0 for FYIs, 20+ for time-sensitive"),
      href: z.string().optional().describe("in-app link, e.g. /m/projects/<id>"),
      dedupeKey: z.string().optional(),
    }),
    execute: async (
      i: {
        type: (typeof ATTENTION_TYPES)[number];
        title: string;
        body?: string;
        project?: string;
        projectRef?: string;
        urgency?: number;
        href?: string;
        dedupeKey?: string;
      },
      ctx: AiToolContext,
    ) => {
      // The project anchor is backbone-owned: the focused subject wins, else a
      // validated NAME, else a validated legacy projects:<uuid>. A wrong or
      // phantom anchor is rejected rather than silently mis-filed.
      let projectRef = i.projectRef;
      let href = i.href;
      // The focused subject is authoritative; a model-supplied name/ref is not.
      const fromFocus = ctx.subject?.kind === "project";
      if (fromFocus || i.project || i.projectRef) {
        const rawId = i.projectRef?.replace(/^projects:/, "");
        const t = await resolveProjectTarget(ctx, { name: i.project, id: rawId });
        if ("error" in t) return { error: t.error };
        projectRef = `projects:${t.id}`;
        if (!href) href = `/m/projects/${t.id}`;
      }
      const row = await insertAttentionItem({
        ...i,
        projectRef,
        href,
        source: "agent",
        // Trust the anchor only when the backbone bound it (focused run).
        trustProjectRef: fromFocus,
      });
      return { id: row.id, raised: true };
    },
  },
  {
    name: "attention.list",
    description:
      "List currently-open attention items so you don't raise a duplicate or can reason about what's already surfaced.",
    input: z.object({ limit: z.number().int().min(1).max(50).optional() }),
    execute: async (i: { limit?: number }) => {
      const rows = await db
        .select({
          id: attentionItems.id,
          type: attentionItems.type,
          title: attentionItems.title,
          projectRef: attentionItems.projectRef,
          dedupeKey: attentionItems.dedupeKey,
        })
        .from(attentionItems)
        .where(eq(attentionItems.status, "open"))
        .orderBy(desc(attentionItems.urgency))
        .limit(i.limit ?? 20);
      return rows;
    },
  },
  {
    name: "projects.setNextAction",
    description:
      "Set a project's single next physical step (GTD). This feeds Plan-my-day and the stall detector. Identify the project by its NAME (validated server-side) — never a raw id; in a focused agent run it targets the focused project. Keep it concrete and doable in one sitting.",
    input: z.object({
      project: z
        .string()
        .optional()
        .describe(
          "Project NAME (validated server-side). Omit in a focused agent run — the focused project is targeted.",
        ),
      projectId: z
        .string()
        .uuid()
        .optional()
        .describe("(legacy) project id; prefer the 'project' name or the focused project"),
      nextAction: z.string().min(3),
    }),
    execute: async (
      i: { project?: string; projectId?: string; nextAction: string },
      ctx: AiToolContext,
    ) => {
      const t = await resolveProjectTarget(ctx, { name: i.project, id: i.projectId });
      if ("error" in t) return { error: t.error };
      await db
        .update(projects)
        .set({ nextAction: i.nextAction.trim(), updatedAt: new Date() })
        .where(eq(projects.id, t.id));
      return { updated: true, project: t.name };
    },
  },
  {
    name: "projects.withoutNextAction",
    description:
      "List active projects (by NAME) that have no next-action set — candidates for the planner/chaser to define one. Use the returned name with projects.setNextAction; there are no ids to copy.",
    input: z.object({}),
    execute: async () => {
      const rows = await db
        .select({
          name: projects.name,
          nextAction: projects.nextAction,
        })
        .from(projects)
        .where(eq(projects.status, "active"))
        .limit(50);
      return rows.filter((r) => !r.nextAction).map(({ name }) => ({ name }));
    },
  },
];
