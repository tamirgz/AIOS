import { desc, eq } from "drizzle-orm";
import { db } from "@/core/db/client";
import { telegramChannels, telegramPosts, type TelegramPost } from "./schema";

export async function listChannels() {
  return db
    .select()
    .from(telegramChannels)
    .orderBy(desc(telegramChannels.createdAt));
}

export async function recentPosts(
  channel: string,
  limit = 40,
): Promise<TelegramPost[]> {
  return db
    .select()
    .from(telegramPosts)
    .where(eq(telegramPosts.channel, channel))
    .orderBy(desc(telegramPosts.postId))
    .limit(limit);
}
