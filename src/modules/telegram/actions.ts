"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, sql } from "@/core/db/client";
import { telegramChannels } from "./schema";

function revalidate() {
  revalidatePath("/m/telegram");
}

/** Register a public channel as a source, with the domain its posts are judged against. */
export async function addChannel(input: {
  username: string;
  criteria: string;
  backfillDays?: number;
}) {
  const username = input.username.trim().replace(/^@/, "").replace(/^https?:\/\/t\.me\/(s\/)?/, "");
  if (!username) throw new Error("a channel username is required");
  const [row] = await db
    .insert(telegramChannels)
    .values({
      username,
      criteria: input.criteria.trim(),
      backfillDays: input.backfillDays ?? 14,
    })
    .onConflictDoNothing()
    .returning();
  // Kick a first ingest (backfill) in the worker.
  if (row) await sql.notify("telegram_ingest", row.id);
  revalidate();
  return row;
}

export async function ingestNow(channelId: string) {
  await sql.notify("telegram_ingest", channelId);
  revalidate();
}

export async function setChannelEnabled(channelId: string, enabled: boolean) {
  await db
    .update(telegramChannels)
    .set({ enabled: enabled ? "true" : "false" })
    .where(eq(telegramChannels.id, channelId));
  revalidate();
}

export async function deleteChannel(channelId: string) {
  await db.delete(telegramChannels).where(eq(telegramChannels.id, channelId));
  revalidate();
}
