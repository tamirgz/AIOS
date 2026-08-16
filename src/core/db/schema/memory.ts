import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Letta-style labeled memory blocks — small, size-budgeted context injected
 * into EVERY AI call (chat, agents, enrichment). Agents maintain them via the
 * memory.update tool; the user can edit them in Settings.
 */
export const memoryBlocks = pgTable("memory_blocks", {
  label: text("label").primaryKey(),
  description: text("description").notNull(),
  value: text("value").notNull().default(""),
  charLimit: integer("char_limit").notNull().default(1500),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type MemoryBlock = typeof memoryBlocks.$inferSelect;

export const MEMORY_ENTRY_KINDS = [
  "fact",
  "decision",
  "lesson",
  "event",
  "superseded",
] as const;
export type MemoryEntryKind = (typeof MEMORY_ENTRY_KINDS)[number];

/**
 * Archival memory — append-only, semantically searchable long-tail memory
 * (Letta's "archival" tier). Core blocks stay small and always-injected;
 * everything else lands here and is retrieved on demand via memory.recall.
 */
export const memoryEntries = pgTable(
  "memory_entries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    kind: text("kind", { enum: MEMORY_ENTRY_KINDS }).notNull().default("fact"),
    text: text("text").notNull(),
    /** Where it came from: "chat", "agent:<name>", "block:<label>". */
    source: text("source").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("memory_entries_created").on(t.createdAt)],
);

export type MemoryEntry = typeof memoryEntries.$inferSelect;
