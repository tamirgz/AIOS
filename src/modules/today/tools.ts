import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/core/db/client";
import type { AiToolDef } from "@/core/modules/types.server";
import { projects } from "@/modules/projects/schema";
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
      "Surface something that needs the user's attention as a card in the 'Needs you' queue. Deduplication is automatic — at most one open card per (project + title), so re-running, or another agent raising the same thing, never creates a duplicate; you don't need to manage a key. Prefer 'notify' for FYIs, 'do' for a suggested next action, 'question' for a decision, 'approve' only when a real side-effect needs sign-off.",
    input: z.object({
      type: z.enum(ATTENTION_TYPES),
      title: z.string().min(3),
      body: z.string().optional(),
      projectRef: z
        .string()
        .optional()
        .describe("projects:<uuid> to anchor to a project, else omit"),
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
    execute: async (i: {
      type: (typeof ATTENTION_TYPES)[number];
      title: string;
      body?: string;
      projectRef?: string;
      urgency?: number;
      href?: string;
      dedupeKey?: string;
    }) => {
      const row = await insertAttentionItem({ ...i, source: "agent" });
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
      "Set a project's single next physical step (GTD). This feeds Plan-my-day and the stall detector. Keep it concrete and doable in one sitting.",
    input: z.object({
      projectId: z.string().uuid(),
      nextAction: z.string().min(3),
    }),
    execute: async (i: { projectId: string; nextAction: string }) => {
      await db
        .update(projects)
        .set({ nextAction: i.nextAction.trim(), updatedAt: new Date() })
        .where(eq(projects.id, i.projectId));
      return { updated: true };
    },
  },
  {
    name: "projects.withoutNextAction",
    description:
      "List active projects that have no next-action set — candidates for the planner/chaser to define one.",
    input: z.object({}),
    execute: async () => {
      const rows = await db
        .select({
          id: projects.id,
          name: projects.name,
          nextAction: projects.nextAction,
        })
        .from(projects)
        .where(eq(projects.status, "active"))
        .limit(50);
      return rows.filter((r) => !r.nextAction).map(({ id, name }) => ({ id, name }));
    },
  },
];
