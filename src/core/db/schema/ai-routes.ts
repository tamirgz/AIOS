import { jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// "nvidia" = free-tier NVIDIA cloud (OpenAI-compatible). Guarded so only $0
// models can run — see src/core/ai/nvidia.ts. Text column, so no migration.
export const AI_PROVIDERS = ["anthropic", "ollama", "nvidia"] as const;
export type AIProviderId = (typeof AI_PROVIDERS)[number];

/**
 * Provider/model routing table. Keys: "chat", "agent.default", "agent:<uuid>".
 * Resolution order: exact key → "agent.default" → "chat".
 */
export const aiRoutes = pgTable("ai_routes", {
  taskKey: text("task_key").primaryKey(),
  provider: text("provider", { enum: AI_PROVIDERS }).notNull(),
  model: text("model").notNull(),
  options: jsonb("options"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type AiRoute = typeof aiRoutes.$inferSelect;
