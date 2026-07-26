"use server";

import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/core/db/client";
import { answerQuestion, type AskAnswer } from "./answer";
import { askHistory, type AskHistoryEntry } from "./schema";

/** Ask a question, and persist it so revisiting it later is instant. */
export async function ask(query: string): Promise<AskAnswer & { historyId: string | null }> {
  const result = await answerQuestion(query);
  const q = query.trim();
  if (!q) return { ...result, historyId: null };

  const [row] = await db
    .insert(askHistory)
    .values({
      query: q,
      answer: result.answer,
      sources: result.sources,
      model: result.model || null,
    })
    .returning({ id: askHistory.id });

  revalidatePath("/m/ask");
  return { ...result, historyId: row.id };
}

/** Full history, newest first — fetched once so re-opening a past question is instant, no re-query. */
export async function listAskHistory(): Promise<AskHistoryEntry[]> {
  return db.select().from(askHistory).orderBy(desc(askHistory.createdAt)).limit(200);
}

/** Delete one history entry. Deliberately no bulk/clear-all — one at a time. */
export async function deleteAskHistoryEntry(id: string): Promise<void> {
  await db.delete(askHistory).where(eq(askHistory.id, id));
  revalidatePath("/m/ask");
}
