import { db, sql } from "@/core/db/client";
import {
  notifications,
  type NotificationLevel,
} from "@/core/db/schema/notifications";

/**
 * Create a notification. Lands in the bell feed (SSE) and — when a Slack
 * webhook is configured — is delivered by the worker's "notifications"
 * listener.
 */
export async function notify(input: {
  title: string;
  body?: string;
  level?: NotificationLevel;
  source: string;
  href?: string;
}) {
  const [row] = await db
    .insert(notifications)
    .values({
      title: input.title.slice(0, 200),
      body: input.body ?? null,
      level: input.level ?? "info",
      source: input.source,
      href: input.href ?? null,
    })
    .returning();
  await sql.notify("notifications", row.id);
  return row;
}
