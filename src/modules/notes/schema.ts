import { sql } from "drizzle-orm";
import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const notes = pgTable("notes", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  tags: text("tags").array(),
  /**
   * Multi-filing: the projects/areas this note is filed under, as entity refs
   * ("projects:<uuid>"). A note can live in several at once (like Ask answers
   * and Workbench tasks). The legacy single `projectRef` above is being retired
   * — readers use this array; it's what the connections engine unnests.
   */
  projectRefs: jsonb("project_refs").$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Note = typeof notes.$inferSelect;

/** SQL predicate: this note's `project_refs` array contains "projects:<id>". */
export function filedUnder(projectId: string) {
  return sql`${notes.projectRefs} @> ${JSON.stringify([`projects:${projectId}`])}::jsonb`;
}
