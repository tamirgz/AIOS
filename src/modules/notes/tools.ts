import { z } from "zod";
import { desc, eq, ilike, or } from "drizzle-orm";
import type { AiToolDef } from "@/core/modules/types.server";
import { notes } from "./schema";

export const noteTools: AiToolDef[] = [
  {
    name: "notes.create",
    description:
      "Create a new markdown note. Use for capturing ideas, references or longer-form text.",
    input: z.object({
      title: z.string().min(1).describe("Short note title"),
      body: z.string().optional().describe("Markdown body"),
    }),
    async execute(input, { db }) {
      const [row] = await db
        .insert(notes)
        .values({
          title: input.title,
          body: input.body ?? "",
        })
        .returning();
      return { created: { id: row.id, title: row.title } };
    },
  },
  {
    name: "notes.search",
    description:
      "Search notes by a case-insensitive match on title or body. Returns snippets; use notes.read for the full body.",
    input: z.object({
      query: z.string().min(1).describe("Text to search for"),
      limit: z.number().int().min(1).max(50).default(10),
    }),
    async execute(input, { db }) {
      const rows = await db
        .select()
        .from(notes)
        .where(
          or(
            ilike(notes.title, `%${input.query}%`),
            ilike(notes.body, `%${input.query}%`),
          ),
        )
        .orderBy(desc(notes.updatedAt))
        .limit(input.limit);
      return rows.map((n) => ({
        id: n.id,
        title: n.title,
        snippet: n.body.slice(0, 200),
        updatedAt: n.updatedAt,
      }));
    },
  },
  {
    name: "notes.read",
    description:
      "Read a single note in full, including its markdown body. Find the id via notes.search first.",
    input: z.object({
      id: z.string().uuid(),
    }),
    async execute(input, { db }) {
      const [row] = await db
        .select()
        .from(notes)
        .where(eq(notes.id, input.id))
        .limit(1);
      return row
        ? {
            id: row.id,
            title: row.title,
            body: row.body,
            tags: row.tags,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
          }
        : { error: "note not found" };
    },
  },
  {
    name: "notes.append",
    description:
      "Append markdown text to the end of an existing note's body. Find the id via notes.search first.",
    input: z.object({
      id: z.string().uuid(),
      text: z.string().min(1).describe("Markdown text to append"),
    }),
    async execute(input, { db }) {
      const [row] = await db
        .select()
        .from(notes)
        .where(eq(notes.id, input.id))
        .limit(1);
      if (!row) return { error: "note not found" };
      const [updated] = await db
        .update(notes)
        .set({
          body: row.body ? `${row.body}\n\n${input.text}` : input.text,
          updatedAt: new Date(),
        })
        .where(eq(notes.id, input.id))
        .returning();
      return { updated: { id: updated.id, title: updated.title } };
    },
  },
];
