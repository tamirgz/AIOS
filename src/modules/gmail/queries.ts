import { desc, eq, sql } from "drizzle-orm";
import { db as defaultDb, type Db } from "@/core/db/client";
import { gmailMessages, type GmailMessage } from "./schema";

export async function listRecentMessages(limit = 50, db: Db = defaultDb): Promise<GmailMessage[]> {
  return db
    .select()
    .from(gmailMessages)
    .orderBy(desc(gmailMessages.receivedAt))
    .limit(limit);
}

export async function unreadCount(db: Db = defaultDb): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(gmailMessages)
    .where(eq(gmailMessages.unread, true));
  return Number(row?.n ?? 0);
}
