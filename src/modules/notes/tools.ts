import { z } from "zod";
import { and, desc, eq, ilike, or } from "drizzle-orm";
import type { AiToolDef } from "@/core/modules/types.server";
import { registerRefs, resolveRef } from "@/core/ai/refs";
import { resolveProjectByName } from "@/modules/projects/subject";
import { filedUnder, notes } from "./schema";

export const noteTools: AiToolDef[] = [
  {
    name: "notes.setProject",
    description:
      "Link a note to a project (or unlink by omitting project). Identify the note by its `ref` from notes.search (e.g. 'n2') and the project by its NAME — never raw ids.",
    input: z.object({
      ref: z.string().describe("Note ref from notes.search, e.g. 'n2'"),
      project: z
        .string()
        .optional()
        .describe("Project NAME to file under (validated); omit to unlink"),
    }),
    async execute(input, ctx) {
      const n = resolveRef(ctx, "note", input.ref);
      if ("error" in n) return n;
      let projectRefs: string[] = [];
      if (input.project) {
        const p = await resolveProjectByName(ctx, input.project);
        if ("error" in p) return p;
        projectRefs = [`projects:${p.id}`];
      }
      const [row] = await ctx.db
        .update(notes)
        .set({ projectRefs, updatedAt: new Date() })
        .where(eq(notes.id, n.id))
        .returning();
      return row
        ? { updated: { id: row.id, projectRefs: row.projectRefs } }
        : { error: "note not found" };
    },
  },
  {
    name: "notes.create",
    description:
      "Create a new markdown note. Use for capturing ideas, references or longer-form text. Optionally file it under a project by NAME (validated) — never a raw id.",
    input: z.object({
      title: z.string().min(1).describe("Short note title"),
      body: z.string().optional().describe("Markdown body"),
      project: z
        .string()
        .optional()
        .describe("Project NAME to file the note under (validated)"),
    }),
    async execute(input, ctx) {
      let projectRefs: string[] = [];
      if (input.project) {
        const p = await resolveProjectByName(ctx, input.project);
        if ("error" in p) return p;
        projectRefs = [`projects:${p.id}`];
      }
      const [row] = await ctx.db
        .insert(notes)
        .values({ title: input.title, body: input.body ?? "", projectRefs })
        .returning();
      return { created: { id: row.id, title: row.title } };
    },
  },
  {
    name: "notes.search",
    description:
      "Search notes by a case-insensitive match on title or body. Each result carries a short `ref` (n1, n2…) — use it with notes.read / notes.append / notes.setProject. Returns snippets; use notes.read for the full body.",
    input: z.object({
      query: z.string().min(1).describe("Text to search for"),
      project: z
        .string()
        .optional()
        .describe("Only notes filed under this project NAME (validated)"),
      limit: z.number().int().min(1).max(50).default(10),
    }),
    async execute(input, ctx) {
      let projId: string | undefined;
      if (input.project) {
        const p = await resolveProjectByName(ctx, input.project);
        if ("error" in p) return p;
        projId = p.id;
      }
      const match = or(
        ilike(notes.title, `%${input.query}%`),
        ilike(notes.body, `%${input.query}%`),
      );
      const rows = await ctx.db
        .select()
        .from(notes)
        .where(projId ? and(match, filedUnder(projId)) : match)
        .orderBy(desc(notes.updatedAt))
        .limit(input.limit);
      return registerRefs(
        ctx,
        "note",
        "n",
        rows.map((n) => ({
          id: n.id,
          title: n.title,
          snippet: n.body.slice(0, 200),
          projectRefs: n.projectRefs,
          updatedAt: n.updatedAt,
        })),
      );
    },
  },
  {
    name: "notes.read",
    description:
      "Read a single note in full, including its markdown body. Identify it by its `ref` from notes.search (e.g. 'n2').",
    input: z.object({
      ref: z.string().describe("Note ref from notes.search, e.g. 'n2'"),
    }),
    async execute(input, ctx) {
      const n = resolveRef(ctx, "note", input.ref);
      if ("error" in n) return n;
      const [row] = await ctx.db
        .select()
        .from(notes)
        .where(eq(notes.id, n.id))
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
      "Append markdown text to the end of an existing note's body. Identify the note by its `ref` from notes.search (e.g. 'n2').",
    input: z.object({
      ref: z.string().describe("Note ref from notes.search, e.g. 'n2'"),
      text: z.string().min(1).describe("Markdown text to append"),
    }),
    async execute(input, ctx) {
      const n = resolveRef(ctx, "note", input.ref);
      if ("error" in n) return n;
      const [row] = await ctx.db
        .select()
        .from(notes)
        .where(eq(notes.id, n.id))
        .limit(1);
      if (!row) return { error: "note not found" };
      const [updated] = await ctx.db
        .update(notes)
        .set({
          body: row.body ? `${row.body}\n\n${input.text}` : input.text,
          updatedAt: new Date(),
        })
        .where(eq(notes.id, n.id))
        .returning();
      return { updated: { id: updated.id, title: updated.title } };
    },
  },
];
