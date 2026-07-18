"use server";

import { desc, isNull } from "drizzle-orm";
import { db, sql as pgsql } from "@/core/db/client";
import { notifications } from "@/core/db/schema/notifications";
import { sql } from "drizzle-orm";

export async function listNotifications(limit = 15) {
  const rows = await db
    .select()
    .from(notifications)
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
  const [{ unread }] = await db
    .select({ unread: sql<number>`count(*)` })
    .from(notifications)
    .where(isNull(notifications.readAt));
  return { rows, unread: Number(unread) };
}

export async function markAllNotificationsRead() {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(isNull(notifications.readAt));
  await pgsql.notify("notifications", "read");
}
