/**
 * Worker-safe core for the attention spine — no `use server`, no `next/cache`.
 * The agent tools (worker) and the web server actions both call these; only
 * the web actions add `revalidatePath` on top. This is the pattern that keeps
 * `revalidatePath` from throwing when an agent raises a card from the worker.
 */
import { and, eq, sql as dsql } from "drizzle-orm";
import { db, sql } from "@/core/db/client";
import { attentionItems, type AttentionType } from "./schema";

export interface RaiseInput {
  type: AttentionType;
  title: string;
  body?: string | null;
  projectRef?: string | null;
  personRef?: string | null;
  source?: string;
  urgency?: number;
  dueAt?: Date | null;
  href?: string | null;
  payload?: Record<string, unknown>;
  dedupeKey?: string | null;
}

/**
 * Insert an attention item, idempotent on `dedupeKey`: an existing OPEN card
 * with the same key short-circuits, so a re-running agent never stacks
 * duplicate nudges. Returns the row (new or existing).
 */
export async function insertAttentionItem(input: RaiseInput) {
  if (input.dedupeKey) {
    const [existing] = await db
      .select()
      .from(attentionItems)
      .where(
        and(
          eq(attentionItems.dedupeKey, input.dedupeKey),
          eq(attentionItems.status, "open"),
        ),
      )
      .limit(1);
    if (existing) return existing;
  }
  const [row] = await db
    .insert(attentionItems)
    .values({
      type: input.type,
      title: input.title.trim(),
      body: input.body?.trim() || null,
      projectRef: input.projectRef ?? null,
      personRef: input.personRef ?? null,
      source: input.source ?? "system",
      urgency: input.urgency ?? 0,
      dueAt: input.dueAt ?? null,
      href: input.href ?? null,
      payload: input.payload ?? {},
      dedupeKey: input.dedupeKey ?? null,
    })
    .returning();
  await sql.notify("attention_changed", "");
  return row;
}

/** Re-open snoozed items whose time has come. Called by the worker sweep. */
export async function wakeSnoozed(): Promise<number> {
  const woken = await db
    .update(attentionItems)
    .set({ status: "open", snoozedUntil: null, updatedAt: new Date() })
    .where(
      and(
        eq(attentionItems.status, "snoozed"),
        dsql`${attentionItems.snoozedUntil} <= now()`,
      ),
    )
    .returning({ id: attentionItems.id });
  if (woken.length) await sql.notify("attention_changed", "");
  return woken.length;
}

/** Drop long-dead rows so the table can't grow without bound. */
export async function pruneAttention(): Promise<void> {
  await db
    .delete(attentionItems)
    .where(
      and(
        dsql`${attentionItems.status} in ('done','dismissed')`,
        dsql`${attentionItems.updatedAt} < now() - interval '30 days'`,
      ),
    );
}
