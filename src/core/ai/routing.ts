import { eq } from "drizzle-orm";
import { db, sql } from "@/core/db/client";
import { aiRoutes, type AIProviderId } from "@/core/db/schema/ai-routes";
import type { AIProvider } from "./provider";
import { anthropicProvider } from "./anthropic";
import { ollamaProvider } from "./ollama";

export const providers: Record<AIProviderId, AIProvider> = {
  anthropic: anthropicProvider,
  ollama: ollamaProvider,
};

export interface ResolvedRoute {
  taskKey: string;
  provider: AIProvider;
  providerId: AIProviderId;
  model: string;
}

const DEFAULTS: { taskKey: string; provider: AIProviderId; model: string }[] = [
  { taskKey: "chat", provider: "anthropic", model: "claude-sonnet-5" },
  { taskKey: "agent.default", provider: "anthropic", model: "claude-sonnet-5" },
  {
    taskKey: "knowledge.enrich",
    provider: "anthropic",
    model: "claude-sonnet-5",
  },
];

/** Insert default rows once so the Settings UI always has something to edit. */
export async function ensureDefaultRoutes() {
  await db.insert(aiRoutes).values(DEFAULTS).onConflictDoNothing();
}

/** Exact key → "agent.default" → "chat" → hard default. */
export async function resolveRoute(taskKey: string): Promise<ResolvedRoute> {
  const keys =
    taskKey === "chat" ? ["chat"] : [taskKey, "agent.default", "chat"];
  for (const key of keys) {
    const [row] = await db
      .select()
      .from(aiRoutes)
      .where(eq(aiRoutes.taskKey, key))
      .limit(1);
    if (row) {
      return {
        taskKey,
        provider: providers[row.provider],
        providerId: row.provider,
        model: row.model,
      };
    }
  }
  return {
    taskKey,
    provider: anthropicProvider,
    providerId: "anthropic",
    model: "claude-sonnet-5",
  };
}

export async function setRoute(
  taskKey: string,
  provider: AIProviderId,
  model: string,
) {
  await db
    .insert(aiRoutes)
    .values({ taskKey, provider, model, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: aiRoutes.taskKey,
      set: { provider, model, updatedAt: new Date() },
    });
  // Let the worker hot-reload its routing without polling.
  await sql.notify("config_changed", taskKey);
}
