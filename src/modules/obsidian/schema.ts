import {
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Read-only index of the user's Obsidian vault. AIOS never writes to the
 * vault — it mirrors markdown files so semantic search and agents can answer
 * from years of notes.
 */
export const obsidianNotes = pgTable(
  "obsidian_notes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Absolute file path (also powers obsidian:// deep links). */
    path: text("path").notNull(),
    title: text("title").notNull(),
    /** First ~1.5k chars, markdown stripped — search surface + embed input. */
    excerpt: text("excerpt").notNull().default(""),
    mtime: timestamp("mtime", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("obsidian_notes_path").on(t.path)],
);

export type ObsidianNote = typeof obsidianNotes.$inferSelect;
