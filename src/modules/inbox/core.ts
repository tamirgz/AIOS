/**
 * Worker-safe inbox capture — no `use server`, no next/cache. Both the web
 * actions and background intakes (Slack, etc.) funnel through here; only the
 * web action adds revalidatePath on top. Triage runs async via the
 * `inbox_triage` NOTIFY, exactly as a manual capture does.
 */
import { eq } from "drizzle-orm";
import { db, sql } from "@/core/db/client";
import { inboxItems, type InboxItem } from "./schema";

export async function captureInboxItem(input: {
  input: string;
  source?: string | null;
}): Promise<InboxItem | null> {
  const trimmed = input.input.trim();
  if (!trimmed) return null;

  // Idempotency for programmatic sources: never file the same message twice.
  if (input.source) {
    const [existing] = await db
      .select()
      .from(inboxItems)
      .where(eq(inboxItems.source, input.source))
      .limit(1);
    if (existing) return existing;
  }

  const [row] = await db
    .insert(inboxItems)
    .values({ input: trimmed, source: input.source ?? null })
    .returning();
  await sql.notify("inbox_triage", row.id);
  return row;
}
