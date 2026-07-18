import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const NOTIFICATION_LEVELS = ["info", "success", "warn"] as const;
export type NotificationLevel = (typeof NOTIFICATION_LEVELS)[number];

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: text("title").notNull(),
    body: text("body"),
    level: text("level", { enum: NOTIFICATION_LEVELS })
      .notNull()
      .default("info"),
    /** Origin, e.g. "agent:Daily brief" or "calendar". */
    source: text("source").notNull(),
    /** Optional in-app link. */
    href: text("href"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("notifications_created").on(t.createdAt)],
);

export type Notification = typeof notifications.$inferSelect;
