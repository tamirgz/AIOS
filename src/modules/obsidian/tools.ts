import { z } from "zod";
import { desc, ilike, or } from "drizzle-orm";
import type { AiToolDef } from "@/core/modules/types.server";
import { obsidianNotes } from "./schema";
import { readVaultNote } from "./sync";

export const obsidianTools: AiToolDef[] = [
  {
    name: "obsidian.search",
    description:
      "Keyword search over the user's Obsidian vault index (titles + excerpts). For meaning-based search across everything, prefer search.everything.",
    input: z.object({
      query: z.string().min(1),
      limit: z.number().int().min(1).max(30).default(10),
    }),
    async execute(input, { db }) {
      const q = `%${input.query}%`;
      const rows = await db
        .select({
          path: obsidianNotes.path,
          title: obsidianNotes.title,
          excerpt: obsidianNotes.excerpt,
          mtime: obsidianNotes.mtime,
        })
        .from(obsidianNotes)
        .where(
          or(ilike(obsidianNotes.title, q), ilike(obsidianNotes.excerpt, q)),
        )
        .orderBy(desc(obsidianNotes.mtime))
        .limit(input.limit);
      return rows.map((r) => ({
        path: r.path,
        title: r.title,
        excerpt: r.excerpt.slice(0, 200),
      }));
    },
  },
  {
    name: "obsidian.read",
    description:
      "Read the full markdown content of one Obsidian vault note by its path (from obsidian.search or search.everything results).",
    input: z.object({ path: z.string().min(1) }),
    async execute(input) {
      try {
        return { content: await readVaultNote(input.path) };
      } catch (e) {
        return { error: String(e) };
      }
    },
  },
];
