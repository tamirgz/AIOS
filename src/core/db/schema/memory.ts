import { integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

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
