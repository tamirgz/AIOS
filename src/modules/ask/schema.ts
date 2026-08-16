import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export interface AskSource {
  n: number;
  kind: string;
  title: string;
  href: string;
  snippet: string | null;
}

/**
 * Every question asked + its computed answer, persisted so revisiting one is
 * instant (no re-retrieval, no re-running the LLM) and so it isn't lost when
 * the page reloads. Deleted one row at a time from the UI — no bulk-clear.
 */
export const askHistory = pgTable("ask_history", {
  id: uuid("id").defaultRandom().primaryKey(),
  query: text("query").notNull(),
  /** Optional user-set header; the question is shown when this is null. */
  title: text("title"),
  /** Filed under any number of projects/areas (["projects:<uuid>", …]). */
  projectRefs: jsonb("project_refs").$type<string[]>().notNull().default([]),
  answer: text("answer").notNull(),
  sources: jsonb("sources").$type<AskSource[]>().notNull().default([]),
  model: text("model"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type AskHistoryEntry = typeof askHistory.$inferSelect;
