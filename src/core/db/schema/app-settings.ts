import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/** Small key/value store for integration settings (ICS URL, Slack webhook…). */
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
