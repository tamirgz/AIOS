import { z } from "zod";
import { asc, eq } from "drizzle-orm";
import type { AiToolDef } from "@/core/modules/types.server";
import {
  contentItems,
  publishAtNullsLast,
  CONTENT_KINDS,
  CONTENT_STAGES,
} from "./schema";

export const contentTools: AiToolDef[] = [
  {
    name: "content.create",
    description:
      "Create a new content item in the pipeline. New items start in the idea stage.",
    input: z.object({
      title: z.string().min(1).describe("Working title of the content piece"),
      kind: z.enum(CONTENT_KINDS).default("post"),
      publishAt: z
        .string()
        .optional()
        .describe("Target publish date-time in ISO 8601, if known"),
    }),
    async execute(input, { db }) {
      const [row] = await db
        .insert(contentItems)
        .values({
          title: input.title,
          kind: input.kind,
          publishAt: input.publishAt ? new Date(input.publishAt) : null,
        })
        .returning();
      return { created: { id: row.id, title: row.title, kind: row.kind } };
    },
  },
  {
    name: "content.list",
    description:
      "List content items, optionally filtered by stage (idea | draft | review | published). Ordered by publish date, unscheduled last.",
    input: z.object({
      stage: z.enum(CONTENT_STAGES).optional(),
      limit: z.number().int().min(1).max(100).default(50),
    }),
    async execute(input, { db }) {
      const rows = await db
        .select()
        .from(contentItems)
        .where(input.stage ? eq(contentItems.stage, input.stage) : undefined)
        .orderBy(publishAtNullsLast, asc(contentItems.createdAt))
        .limit(input.limit);
      return rows.map((c) => ({
        id: c.id,
        title: c.title,
        kind: c.kind,
        stage: c.stage,
        publishAt: c.publishAt,
      }));
    },
  },
  {
    name: "content.setStage",
    description:
      "Move a content item to a new stage (idea | draft | review | published). Find the id via content.list first.",
    input: z.object({
      id: z.string().uuid(),
      stage: z.enum(CONTENT_STAGES),
    }),
    async execute(input, { db }) {
      const [row] = await db
        .update(contentItems)
        .set({ stage: input.stage, updatedAt: new Date() })
        .where(eq(contentItems.id, input.id))
        .returning();
      return row
        ? { updated: { id: row.id, stage: row.stage } }
        : { error: "content item not found" };
    },
  },
];
