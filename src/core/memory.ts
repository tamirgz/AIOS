import { asc, desc, eq, sql as dsql } from "drizzle-orm";
import { db } from "@/core/db/client";
import {
  memoryBlocks,
  memoryEntries,
  type MemoryEntryKind,
} from "@/core/db/schema/memory";

/** Hard caps that keep memory strong but bounded. */
const MAX_BLOCKS = 12;
const DEFAULT_BLOCK_LIMIT = 1200;

const DEFAULT_BLOCKS = [
  {
    label: "who_i_am",
    description: "Who the user is: role, business, what they care about.",
  },
  {
    label: "current_focus",
    description: "What the user is actively working on right now.",
  },
  {
    label: "preferences",
    description:
      "How the user likes things done: tone, formats, working habits.",
  },
  {
    label: "active_projects",
    description: "Short live summary of key projects and their state.",
  },
] as const;

export async function ensureDefaultMemoryBlocks() {
  // Read-first: only write when blocks are actually missing, so the hot path
  // (every AI call renders memory) stays a plain SELECT.
  const existing = await db
    .select({ label: memoryBlocks.label })
    .from(memoryBlocks);
  if (existing.length >= DEFAULT_BLOCKS.length) return;
  const have = new Set(existing.map((r) => r.label));
  const missing = DEFAULT_BLOCKS.filter((b) => !have.has(b.label));
  if (missing.length) {
    await db
      .insert(memoryBlocks)
      .values(missing.map((b) => ({ ...b })))
      .onConflictDoNothing();
  }
}

export async function listMemoryBlocks() {
  await ensureDefaultMemoryBlocks();
  return db.select().from(memoryBlocks).orderBy(asc(memoryBlocks.label));
}

/** Rendered for system prompts. Never throws — memory being unavailable must
 *  not take down chat, agents, or pages. */
export async function renderMemoryContext(): Promise<string> {
  let blocks;
  try {
    blocks = await listMemoryBlocks();
  } catch {
    return "";
  }
  const lines = blocks.map((b) =>
    b.value.trim()
      ? `<${b.label}>\n${b.value.trim()}\n</${b.label}>`
      : `<${b.label}> (empty — fill via memory.update when you learn something) </${b.label}>`,
  );
  return [
    "PERSISTENT MEMORY (shared across chat and all agents; keep it current with the memory.update tool):",
    ...lines,
    "Long-tail memory: use memory.recall to search past decisions/lessons/events before repeating work, and memory.remember to store durable ones.",
  ].join("\n");
}

export async function updateMemoryBlock(
  label: string,
  value: string,
  mode: "replace" | "append" = "replace",
  description?: string,
) {
  const slug = label.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_");
  if (!slug) throw new Error("memory block label required");

  let [block] = await db
    .select()
    .from(memoryBlocks)
    .where(eq(memoryBlocks.label, slug));

  // Dynamic blocks: create on first write, bounded by MAX_BLOCKS.
  if (!block) {
    const count = (await db.select({ l: memoryBlocks.label }).from(memoryBlocks))
      .length;
    if (count >= MAX_BLOCKS) {
      throw new Error(
        `memory block limit reached (${MAX_BLOCKS}) — reuse or clear an existing block instead of creating "${slug}"`,
      );
    }
    [block] = await db
      .insert(memoryBlocks)
      .values({
        label: slug,
        description: description?.trim() || "Agent/user-defined context block.",
        charLimit: DEFAULT_BLOCK_LIMIT,
      })
      .returning();
  }

  const next =
    mode === "append" && block.value.trim()
      ? `${block.value.trim()}\n${value.trim()}`
      : value.trim();
  if (next.length > block.charLimit) {
    throw new Error(
      `memory block "${slug}" would exceed its ${block.charLimit}-char budget (${next.length}); compress the content instead`,
    );
  }

  // Provenance: a replaced non-trivial value is never lost — it becomes an
  // archival entry, searchable via memory.recall.
  if (mode === "replace" && block.value.trim() && block.value.trim() !== next) {
    await rememberEntry({
      kind: "superseded",
      text: `[${slug}] ${block.value.trim()}`,
      source: `block:${slug}`,
    });
  }

  await db
    .update(memoryBlocks)
    .set({ value: next, updatedAt: new Date() })
    .where(eq(memoryBlocks.label, slug));
  return next;
}

/** Create an empty block explicitly (Settings UI). */
export async function createMemoryBlockDef(label: string, description: string) {
  const slug = label.trim().toLowerCase().replace(/[^a-z0-9_]+/g, "_");
  if (!slug) throw new Error("label required");
  const count = (await db.select({ l: memoryBlocks.label }).from(memoryBlocks))
    .length;
  if (count >= MAX_BLOCKS) {
    throw new Error(`memory block limit reached (${MAX_BLOCKS})`);
  }
  await db
    .insert(memoryBlocks)
    .values({
      label: slug,
      description: description.trim() || "User-defined context block.",
      charLimit: DEFAULT_BLOCK_LIMIT,
    })
    .onConflictDoNothing();
}

/** Append to archival memory. Embedding is filled by the worker sweep. */
export async function rememberEntry(input: {
  kind: MemoryEntryKind;
  text: string;
  source: string;
}) {
  const text = input.text.trim();
  if (!text) throw new Error("memory entry text required");
  const [row] = await db
    .insert(memoryEntries)
    .values({ kind: input.kind, text: text.slice(0, 2000), source: input.source })
    .returning();
  return row;
}

/** Semantic recall over archival memory, with keyword fallback while
 *  embeddings backfill. Never throws — recall failures degrade to []. */
export async function recallEntries(
  query: string,
  limit = 6,
): Promise<{ kind: string; text: string; when: Date; source: string }[]> {
  try {
    const { embedText } = await import("@/core/embeddings");
    const vec = `[${(await embedText(query)).join(",")}]`;
    const rows = await db.execute<{
      kind: string;
      text: string;
      created_at: Date;
      source: string;
    }>(dsql`
      select kind, text, created_at, source,
             (embedding <=> ${vec}::vector) as distance
        from memory_entries
       where embedding is not null
       order by distance asc
       limit ${limit}
    `);
    if ([...rows].length > 0) {
      return [...rows].map((r) => ({
        kind: r.kind,
        text: r.text,
        when: new Date(r.created_at),
        source: r.source,
      }));
    }
  } catch {
    // fall through to keyword search
  }
  const fallback = await db
    .select()
    .from(memoryEntries)
    .where(dsql`${memoryEntries.text} ilike ${"%" + query + "%"}`)
    .orderBy(desc(memoryEntries.createdAt))
    .limit(limit);
  return fallback.map((r) => ({
    kind: r.kind,
    text: r.text,
    when: r.createdAt,
    source: r.source,
  }));
}
