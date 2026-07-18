"use server";

import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, sql } from "@/core/db/client";
import { inboxItems } from "./schema";

export async function listInbox() {
  return db
    .select()
    .from(inboxItems)
    .orderBy(desc(inboxItems.createdAt))
    .limit(100);
}

/** Instant, deterministic save — triage happens async in the worker. */
export async function captureToInbox(input: string) {
  const trimmed = input.trim();
  if (!trimmed) throw new Error("nothing to capture");
  const [row] = await db
    .insert(inboxItems)
    .values({ input: trimmed })
    .returning();
  await sql.notify("inbox_triage", row.id);
  revalidatePath("/m/inbox");
  revalidatePath("/");
  return row;
}

export async function retryTriage(id: string) {
  await db
    .update(inboxItems)
    .set({ status: "new", error: null })
    .where(eq(inboxItems.id, id));
  await sql.notify("inbox_triage", id);
  revalidatePath("/m/inbox");
}

export async function deleteInboxItem(id: string) {
  await db.delete(inboxItems).where(eq(inboxItems.id, id));
  revalidatePath("/m/inbox");
  revalidatePath("/");
}
