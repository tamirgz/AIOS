import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Reports from agents that run OUTSIDE AIOS (Claude Desktop scheduled tasks,
 * background jobs, any external tool). Ingested by the worker from the
 * drop-box folder and from ~/.claude/jobs — AIOS-native agent runs live in
 * agent_runs, not here.
 */
export const externalReports = pgTable(
  "external_reports",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** Stable identity of the origin, e.g. "file:daily-brief-2026-07-19.md" or "claude-job:292314b4". */
    source: text("source").notNull(),
    kind: text("kind", { enum: ["dropbox", "claude-job"] }).notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    /** When the external agent produced it (file mtime / job updatedAt). */
    reportedAt: timestamp("reported_at", { withTimezone: true }).notNull(),
    ingestedAt: timestamp("ingested_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("external_reports_source").on(t.source),
    index("external_reports_reported").on(t.reportedAt),
  ],
);

export type ExternalReport = typeof externalReports.$inferSelect;
