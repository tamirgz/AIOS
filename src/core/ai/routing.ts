import { inArray } from "drizzle-orm";
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
  {
    taskKey: "inbox.triage",
    provider: "anthropic",
    model: "claude-haiku-4-5-20251001",
  },
];

/** Insert default rows once so the Settings UI always has something to edit.
 *  Read-first: the common case stays a single SELECT. */
export async function ensureDefaultRoutes() {
  const existing = await db
    .select({ taskKey: aiRoutes.taskKey })
    .from(aiRoutes);
  const have = new Set(existing.map((r) => r.taskKey));
  const missing = DEFAULTS.filter((d) => !have.has(d.taskKey));
  if (missing.length) {
    await db.insert(aiRoutes).values(missing).onConflictDoNothing();
  }
}

/** Exact key → "agent.default" → "chat" → hard default. One query. */
export async function resolveRoute(taskKey: string): Promise<ResolvedRoute> {
  const keys =
    taskKey === "chat" ? ["chat"] : [taskKey, "agent.default", "chat"];
  const rows = await db
    .select()
    .from(aiRoutes)
    .where(inArray(aiRoutes.taskKey, keys));
  const byKey = new Map(rows.map((r) => [r.taskKey, r]));
  for (const key of keys) {
    const row = byKey.get(key);
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
