import { z } from "zod";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import type { AiToolDef } from "@/core/modules/types.server";
import { notes } from "./schema";

export const noteTools: AiToolDef[] = [
  {
    name: "notes.setProject",
    description:
      "Link a note to a project (or unlink with projectId omitted). Find ids via notes.search and projects.list.",
    input: z.object({
      id: z.string().uuid(),
      projectId: z
        .string()
        .uuid()
        .optional()
        .describe("Omit to remove the note from its project"),
    }),
    async execute(input, { db }) {
      const [row] = await db
        .update(notes)
        .set({
          projectRef: input.projectId ? `projects:${input.projectId}` : null,
          updatedAt: new Date(),
        })
        .where(eq(notes.id, input.id))
        .returning();
      return row
        ? { updated: { id: row.id, projectRef: row.projectRef } }
        : { error: "note not found" };
    },
  },
  {
    name: "notes.create",
    description:
      "Create a new markdown note. Use for capturing ideas, references or longer-form text.",
    input: z.object({
      title: z.string().min(1).describe("Short note title"),
      body: z.string().optional().describe("Markdown body"),
      projectId: z
        .string()
        .uuid()
        .optional()
        .describe("Link the note to this project (from projects.list)"),
    }),
    async execute(input, { db }) {
      const [row] = await db
        .insert(notes)
        .values({
          title: input.title,
          body: input.body ?? "",
          projectRef: input.projectId ? `projects:${input.projectId}` : null,
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
      projectId: z
        .string()
        .uuid()
        .optional()
        .describe("Only notes linked to this project"),
      limit: z.number().int().min(1).max(50).default(10),
    }),
    async execute(input, { db }) {
      const match = or(
        ilike(notes.title, `%${input.query}%`),
        ilike(notes.body, `%${input.query}%`),
      );
      const rows = await db
        .select()
        .from(notes)
        .where(
          input.projectId
            ? and(match, eq(notes.projectRef, `projects:${input.projectId}`))
            : match,
        )
        .orderBy(desc(notes.updatedAt))
        .limit(input.limit);
      return rows.map((n) => ({
        id: n.id,
        title: n.title,
        snippet: n.body.slice(0, 200),
        projectRef: n.projectRef,
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
