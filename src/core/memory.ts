import { asc, eq } from "drizzle-orm";
import { db } from "@/core/db/client";
import { memoryBlocks } from "@/core/db/schema/memory";

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
  ].join("\n");
}

export async function updateMemoryBlock(
  label: string,
  value: string,
  mode: "replace" | "append" = "replace",
) {
  const [block] = await db
    .select()
    .from(memoryBlocks)
    .where(eq(memoryBlocks.label, label));
  if (!block) throw new Error(`unknown memory block: ${label}`);
  const next =
    mode === "append" && block.value.trim()
      ? `${block.value.trim()}\n${value.trim()}`
      : value.trim();
  if (next.length > block.charLimit) {
    throw new Error(
      `memory block "${label}" would exceed its ${block.charLimit}-char budget (${next.length}); compress the content instead`,
    );
  }
  await db
    .update(memoryBlocks)
    .set({ value: next, updatedAt: new Date() })
    .where(eq(memoryBlocks.label, label));
  return next;
}
