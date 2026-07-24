import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * Read-only mirror of recent Gmail messages (metadata only — never the body).
 * Synced from the Gmail API using the shared Google OAuth. Feeds the daily
 * plan and the follow-up tracker; the id is Gmail's own message id.
 */
export const gmailMessages = pgTable(
  "gmail_messages",
  {
    id: text("id").primaryKey(),
    threadId: text("thread_id"),
    fromName: text("from_name"),
    fromEmail: text("from_email"),
    subject: text("subject"),
    snippet: text("snippet"),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    unread: boolean("unread").notNull().default(false),
    /** Gmail label ids (INBOX, IMPORTANT, STARRED, UNREAD…). */
    labels: text("labels").array(),
    /** Deep link into the Gmail web UI. */
    link: text("link"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("gmail_received").on(t.receivedAt)],
);

export type GmailMessage = typeof gmailMessages.$inferSelect;
