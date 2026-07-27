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
 * A stable dedupe key derived from the card's CONTENT — the same real thing
 * gets the same key no matter which agent raises it. This is deliberately
 * agent-agnostic: the duplicates we saw came from two different agents
 * (Daily planner, Loose-ends chaser) raising the identical item under their
 * own per-agent keys ("plan:…", "looseend:…"), which a per-key scheme can
 * never collapse. Keying on (project + person + normalized title) instead
 * means at most one OPEN card per real item, whoever raises it. Anchors are
 * included so the same phrasing about different projects/people stays
 * distinct. Callers' own `dedupeKey` is intentionally NOT used here — a
 * content key is the only thing that dedupes across agents.
 */
export function deriveDedupeKey(input: {
  projectRef?: string | null;
  personRef?: string | null;
  title: string;
}): string {
  const proj = input.projectRef ?? "-";
  const person = input.personRef ?? "-";
  const title = input.title.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 160);
  return `auto:${proj}:${person}:${title}`;
}

// Postgres unique-violation SQLSTATE. drizzle wraps the driver error in a
// DrizzleQueryError, so the code lives on `.cause` (the postgres.js error),
// not the top-level object — check both.
function isUniqueViolation(e: unknown): boolean {
  const code = (x: unknown) =>
    typeof x === "object" && x !== null
      ? (x as { code?: string }).code
      : undefined;
  return code(e) === "23505" || code((e as { cause?: unknown })?.cause) === "23505";
}

/**
 * Insert an attention item, idempotent on `dedupeKey`: at most one OPEN card
 * per key ever exists, so a re-running agent never stacks duplicate nudges.
 * The key is the caller's explicit `dedupeKey` or, failing that, one derived
 * from the card content. A partial unique index (attention_dedupe_open) is the
 * real guarantee — the pre-check just avoids the round-trip in the common
 * case, and a lost race surfaces as a unique violation we resolve by returning
 * the existing row. Returns the row (new or existing).
 */
export async function insertAttentionItem(input: RaiseInput) {
  const source = input.source ?? "system";
  // Always a content key — see deriveDedupeKey on why the caller's own
  // dedupeKey is not used for matching (it can't dedupe across agents).
  const dedupeKey = deriveDedupeKey({
    projectRef: input.projectRef,
    personRef: input.personRef,
    title: input.title,
  });

  const findOpen = async () => {
    const [existing] = await db
      .select()
      .from(attentionItems)
      .where(
        and(
          eq(attentionItems.dedupeKey, dedupeKey),
          eq(attentionItems.status, "open"),
        ),
      )
      .limit(1);
    return existing;
  };

  const existing = await findOpen();
  if (existing) return existing;

  try {
    const [row] = await db
      .insert(attentionItems)
      .values({
        type: input.type,
        title: input.title.trim(),
        body: input.body?.trim() || null,
        projectRef: input.projectRef ?? null,
        personRef: input.personRef ?? null,
        source,
        urgency: input.urgency ?? 0,
        dueAt: input.dueAt ?? null,
        href: input.href ?? null,
        payload: input.payload ?? {},
        dedupeKey,
      })
      .returning();
    await sql.notify("attention_changed", "");
    return row;
  } catch (e) {
    // Lost the race against a concurrent raise of the same key — the winner's
    // OPEN row is what the caller wanted anyway.
    if (isUniqueViolation(e)) {
      const winner = await findOpen();
      if (winner) return winner;
    }
    throw e;
  }
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
