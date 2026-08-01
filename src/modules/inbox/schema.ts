import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const INBOX_STATUSES = ["new", "triaging", "triaged", "error"] as const;
export type InboxStatus = (typeof INBOX_STATUSES)[number];

/**
 * Universal capture inbox: anything goes in, an AI triage job routes it into
 * the right module (task / note / knowledge / event) — the mymind principle:
 * the user's only job is to capture, never to file.
 */
export const inboxItems = pgTable("inbox_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  input: text("input").notNull(),
  /**
   * Provenance for programmatic captures (e.g. "slack:<channel>:<ts>"), used
   * to dedupe so the same source message can't be filed twice. Null for
   * manual captures from the UI.
   */
  source: text("source"),
  status: text("status", { enum: INBOX_STATUSES }).notNull().default("new"),
  /**
   * Written by the triage job: a one-line summary and where it routed (the
   * destination module + a link to the created item, so the inbox shows and
   * links to exactly where each capture landed).
   */
  triage: jsonb("triage").$type<{
    summary: string;
    route?: { kind: string; label: string; href: string };
  }>(),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type InboxItem = typeof inboxItems.$inferSelect;
