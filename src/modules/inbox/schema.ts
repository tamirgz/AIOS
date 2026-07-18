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
  status: text("status", { enum: INBOX_STATUSES }).notNull().default("new"),
  /** { summary, actions: string[] } written by the triage job. */
  triage: jsonb("triage").$type<{ summary: string }>(),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type InboxItem = typeof inboxItems.$inferSelect;
