import { inArray } from "drizzle-orm";
import { db, sql } from "@/core/db/client";
import { aiRoutes, type AIProviderId } from "@/core/db/schema/ai-routes";
import type { AIProvider } from "./provider";
import { anthropicProvider } from "./anthropic";
import { ollamaProvider } from "./ollama";
import { nvidiaProvider } from "./nvidia";
import { geminiProvider } from "./gemini";

export const providers: Record<AIProviderId, AIProvider> = {
  anthropic: anthropicProvider,
  ollama: ollamaProvider,
  nvidia: nvidiaProvider,
  gemini: geminiProvider,
};

// Re-exported for server-side callers that already import this module —
// the actual definition lives in the schema file so client components can
// use it without pulling in the provider SDKs above (see that file's comment).
export { CLOUD_PROVIDERS, isCloudProvider } from "@/core/db/schema/ai-routes";

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
  {
    taskKey: "ideas.analyze",
    provider: "anthropic",
    model: "claude-sonnet-5",
  },
  // Ask (cited Q&A over the user's corpus) — Ollama-first, free by default.
  // Editable in Settings; escalate to Claude there if you want deeper synthesis.
  { taskKey: "ask", provider: "ollama", model: "qwen3-coder:30b" },
  // Every key below is seeded ONLY so it shows up in Settings → AI Routing.
  // Each is seeded at the model it already resolved to, so adding the row
  // changes nothing until you change it — the point is visibility, not a
  // silent re-route. Token policy: ONE-STOP-PLAN §4.
  //
  // Workbench "docs"/native tasks (AIOS's own data + module tools). Previously
  // fell through to agent.default; §4's target for this job is a local model.
  { taskKey: "workbench.native", provider: "anthropic", model: "claude-sonnet-5" },
  // The verifying judge that gates delegated work: it reads the ask + the
  // produced result and decides whether the result actually satisfies the ask
  // (A2 · Trust). A capable brain by default — this is the correctness gate,
  // not the cheap path. Editable in Settings.
  { taskKey: "workbench.judge", provider: "anthropic", model: "claude-sonnet-5" },
  // The routine BUILDER — composes a routine from a plain-English description
  // (title, trigger, target files) and keeps the ask faithful. Runs ONCE per
  // routine at create time, so a cheap metered model is fine (and it doesn't
  // break the free-model rule, which only governs PERIODIC agents). Settings
  // only — never exposed on the routine card. Default: cheap Haiku.
  {
    taskKey: "routine.builder",
    provider: "anthropic",
    model: "claude-haiku-4-5-20251001",
  },
  // Per-project advisor read + the on-demand "different angle" re-read.
  {
    taskKey: "project.advisor",
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
