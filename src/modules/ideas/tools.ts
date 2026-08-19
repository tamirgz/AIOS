import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import type { AiToolDef } from "@/core/modules/types.server";
import { sql } from "@/core/db/client";
import { registerRefs, resolveRef } from "@/core/ai/refs";
import { ideas, IDEA_CATEGORIES, IDEA_STAGES } from "./schema";

export const ideaTools: AiToolDef[] = [
  {
    name: "ideas.capture",
    description:
      "Save a new idea into the user's idea pipeline (product/business/feature concepts to develop later).",
    input: z.object({
      title: z.string().min(1).describe("The idea, stated crisply"),
      category: z.enum(IDEA_CATEGORIES).default("product"),
      notes: z.string().optional().describe("Context, angle, why now"),
    }),
    async execute(input, { db }) {
      const [row] = await db
        .insert(ideas)
        .values({
          title: input.title,
          category: input.category,
          notes: input.notes ?? null,
        })
        .returning();
      await sql.notify("ideas_changed", row.id);
      return { captured: { id: row.id, title: row.title } };
    },
  },
  {
    name: "ideas.list",
    description:
      "List the user's ideas, optionally by stage (spark | exploring | validated | parked). Includes AI verdict/score when analyzed.",
    input: z.object({
      stage: z.enum(IDEA_STAGES).optional(),
      limit: z.number().int().min(1).max(100).default(50),
    }),
    async execute(input, ctx) {
      const rows = await ctx.db
        .select()
        .from(ideas)
        .where(input.stage ? eq(ideas.stage, input.stage) : undefined)
        .orderBy(desc(ideas.createdAt))
        .limit(input.limit);
      // Short handles (i1, i2…) so a stage change targets the right idea by ref.
      return registerRefs(
        ctx,
        "idea",
        "i",
        rows.map((i) => ({
          id: i.id,
          title: i.title,
          category: i.category,
          stage: i.stage,
          verdict: i.analysis?.verdict ?? null,
          score: i.analysis?.score ?? null,
          createdAt: i.createdAt,
        })),
      );
    },
  },
  {
    name: "ideas.setStage",
    description:
      "Move an idea to a new stage (spark | exploring | validated | parked). Identify the idea by its `ref` from ideas.list (e.g. 'i2') — never a raw id.",
    input: z.object({
      ref: z.string().describe("Idea ref from ideas.list, e.g. 'i2'"),
      stage: z.enum(IDEA_STAGES),
    }),
    async execute(input, ctx) {
      const t = resolveRef(ctx, "idea", input.ref);
      if ("error" in t) return t;
      const [row] = await ctx.db
        .update(ideas)
        .set({ stage: input.stage, updatedAt: new Date() })
        .where(eq(ideas.id, t.id))
        .returning();
      if (row) await sql.notify("ideas_changed", row.id);
      return row
        ? { updated: { id: row.id, stage: row.stage } }
        : { error: "idea not found" };
    },
  },
];
