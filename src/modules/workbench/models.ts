// No `server-only` import: this module is reached by the agent worker (via
// engine.ts), which runs under plain tsx where that package throws. Server-
// only by convention, like the rest of the module's server code.
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { ollamaProvider } from "@/core/ai/ollama";
import { getSetting, setSetting } from "@/core/app-settings";
import {
  type FreeModelHealthSummary,
  filterUsableModels,
  probeFreeModel,
  readHealthLedger,
  recordModelHealthBatch,
  STALE_MS,
  summarizeHealth,
} from "./model-health";

/** app_settings key for the last verify pass's tally (shown in Settings). */
export const FREE_MODEL_HEALTH_KEY = "free_model_health_summary";


/**
 * The free-model catalog for CLI executors.
 *
 * Policy (Tamir): local executors may use any model from their library **only
 * when it is free** — never billed per token. "Free" is decided by real price,
 * not by provider:
 *
 *   - local Ollama                       — always free, unlimited;
 *   - any opencode/Nvidia model priced 0 — opencode's own pricing database
 *     (`~/.cache/opencode/models.json`) is authoritative and reflects the
 *     user's connected keys. This is what separates opencode-zen's Big Pickle
 *     ($0) from opencode's paid GPT-5, and free Nvidia models from the paid
 *     deepseek-v4 ones served through the same key.
 *
 * A model whose price is unknown and non-local is treated as metered — we fail
 * closed on billing.
 */

/** A model's provider = its first path segment; bare names are local Ollama. */
export function providerOf(model: string): string {
  const slash = model.indexOf("/");
  return slash === -1 ? "local" : model.slice(0, slash).toLowerCase();
}

/** Bare model names that are unmistakably paid even without a provider prefix. */
const PAID_BARE = /^(gpt-|o[1-9]|claude-|gemini-)/i;

const OPENCODE_PRICES = join(homedir(), ".cache", "opencode", "models.json");

/**
 * Zero-cost? Reads opencode's pricing DB. `null` = not found there (unknown).
 * Full id `nvidia/deepseek-ai/deepseek-v4-flash` → provider `nvidia`, model
 * key `deepseek-ai/deepseek-v4-flash`.
 */
function pricedFree(fullId: string): boolean | null {
  try {
    const db = JSON.parse(readFileSync(OPENCODE_PRICES, "utf8")) as Record<
      string,
      { models?: Record<string, { cost?: { input?: number; output?: number } }> }
    >;
    const slash = fullId.indexOf("/");
    if (slash === -1) return null;
    const provider = fullId.slice(0, slash);
    const key = fullId.slice(slash + 1);
    const m = db[provider]?.models?.[key];
    if (!m) return null;
    const c = m.cost ?? {};
    return (c.input ?? 0) === 0 && (c.output ?? 0) === 0;
  } catch {
    return null;
  }
}

/** True if the model would bill per token — refused for local executors. */
export function isMeteredModel(model: string): boolean {
  const provider = providerOf(model);
  // Local Ollama can't bill; only reject a bare name that is obviously a paid
  // hosted model typed by mistake.
  if (provider === "local" || provider === "ollama") return PAID_BARE.test(model);
  // Everything cloud is judged by real price. Unknown price → fail closed.
  return pricedFree(model) !== true;
}

/**
 * Give a model the namespace its executor's command template expects.
 *
 * opencode runs `--model {{model}}` with a FULL provider/model spec, so a bare
 * local tag (`qwen3-coder:30b`) MUST keep its `ollama/` prefix — otherwise
 * opencode reads it as a hosted model, the call fails, and the free-model
 * health system "retires" it and suggests cloud alternatives (the bug that bit
 * the NoClick routine). pi injects the provider via its own flag
 * (`--provider ollama`), so it wants the bare tag.
 *
 * Idempotent: an already-namespaced id (`ollama/…`, `nvidia/…`) or an
 * obviously-hosted bare name (`gpt-…`) is returned unchanged.
 */
export function normalizeModelForExecutor(
  model: string | null | undefined,
  commandTemplate: string | null | undefined,
): string | null {
  if (!model) return null;
  if (model.includes("/")) return model; // already namespaced
  if (PAID_BARE.test(model)) return model; // hosted paid model typed bare — leave it
  const tmpl = commandTemplate ?? "";
  // Templates that supply the provider themselves want the bare Ollama tag.
  if (/ollama_chat\/\{\{model\}\}/.test(tmpl) || /--provider\s+ollama/.test(tmpl)) {
    return model;
  }
  // Full-spec template (opencode): a bare tag is a local Ollama model.
  return `ollama/${model}`;
}

/**
 * Execution/save-time guard. A local executor's model must be free; a metered
 * spec is refused with a message rather than silently billed.
 */
export function assertFreeModel(model: string | null | undefined): void {
  if (model && isMeteredModel(model)) {
    throw new Error(
      `"${model}" is not free (opencode prices it above $0, or its price is unknown). Local executors run only free models — pick a $0 one from the library, or run this as a "code" task on Claude.`,
    );
  }
}

/** Non-chat model families opencode surfaces — image, audio, embed, bio, safety. */
const NON_CHAT =
  /(flux|bge|embed|rerank|paligemma|ocr|parakeet|canary|riva|sana|stable-diffusion|nemoretriever|nvclip|\bclip\b|maxine|audio2|fastpitch|cosmos|magpie|whisper|gliner|active-speaker|bevformer|sparsedrive|streampetr|studiovoice|synthetic-video|qwen-image|-image|esm2|esmfold|content-safety|safety-guard|voicechat|\btts\b|usdvalidate)/i;

function isEmbeddingTag(name: string): boolean {
  const n = name.toLowerCase();
  return n.includes("embed") || n.includes("bge-") || n.includes("nomic-");
}

/** Installed local Ollama chat/coding models, embeddings filtered out. */
async function localOllamaModels(): Promise<string[]> {
  try {
    const models = await ollamaProvider.listModels();
    return models.filter((m) => !isEmbeddingTag(m)).sort();
  } catch {
    return [];
  }
}

const OPENCODE_AUTH = join(
  homedir(),
  ".local",
  "share",
  "opencode",
  "auth.json",
);

/**
 * The FREE cloud models opencode can reach, derived from files only — no
 * `opencode models` shell-out, which added ~0.6s+ to every Workbench/Settings
 * render and could spawn a process that hangs.
 *
 * A provider is reachable if the user is authenticated for it (`auth.json`)
 * plus `opencode` itself (its zen free tier needs no login). From opencode's
 * pricing DB we then take that provider's $0 chat/coding models. Reflects the
 * user's connected keys and the real prices, instantly.
 */
function opencodeCloudFreeModels(): string[] {
  try {
    const db = JSON.parse(readFileSync(OPENCODE_PRICES, "utf8")) as Record<
      string,
      { models?: Record<string, { cost?: { input?: number; output?: number } }> }
    >;
    const authed = new Set<string>(["opencode"]);
    try {
      const auth = JSON.parse(readFileSync(OPENCODE_AUTH, "utf8")) as Record<
        string,
        unknown
      >;
      for (const p of Object.keys(auth)) authed.add(p.toLowerCase());
    } catch {
      // no auth file — just the built-in opencode free tier
    }

    const out: string[] = [];
    for (const provider of authed) {
      const models = db[provider]?.models ?? {};
      for (const [key, m] of Object.entries(models)) {
        const c = m.cost ?? {};
        if ((c.input ?? 0) !== 0 || (c.output ?? 0) !== 0) continue;
        const full = `${provider}/${key}`;
        if (!NON_CHAT.test(full)) out.push(full);
      }
    }
    return out.sort();
  } catch {
    return [];
  }
}

/**
 * The free models a given executor may use, in the namespace its command
 * template expects. opencode runs `--model {{model}}` with a full spec, so it
 * gets `ollama/<tag>` for local plus its $0 cloud models; pi wraps a
 * bare Ollama tag in its own provider flag, so it gets the bare local tags.
 */
export async function listFreeModelsFor(executorId: string): Promise<string[]> {
  const local = await localOllamaModels();
  if (executorId === "opencode") {
    const ledger = readHealthLedger();
    return filterUsableModels(
      [...local.map((t) => `ollama/${t}`), ...opencodeCloudFreeModels()],
      ledger,
    );
  }
  return local;
}

/**
 * Short-lived cache: the pickers render on every Workbench/Settings load, but
 * the free catalog changes only when the user pulls a model or connects a key.
 * A 60s TTL keeps those pages instant without going stale in practice.
 */
let cache: { at: number; ids: string; value: Record<string, string[]> } | null =
  null;
const CACHE_TTL_MS = 60_000;

/** Free models keyed by executor id — for the pickers, built in one pass. */
export async function listFreeModelsByExecutor(
  executorIds: string[],
): Promise<Record<string, string[]>> {
  const ids = [...executorIds].sort().join(",");
  if (cache && cache.ids === ids && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.value;
  }

  const local = await localOllamaModels();
  const cloud = executorIds.includes("opencode")
    ? opencodeCloudFreeModels()
    : [];
  const ledger = readHealthLedger();

  const out: Record<string, string[]> = {};
  for (const id of executorIds) {
    const all =
      id === "opencode" ? [...local.map((t) => `ollama/${t}`), ...cloud] : local;
    out[id] = filterUsableModels(all, ledger); // drop retired/broken free models
  }
  cache = { at: Date.now(), ids, value: out };
  return out;
}

/**
 * Verify pass: live-probe the free cloud models opencode offers ($0 calls) and
 * record what's actually reachable, so the pickers can hide the dead ones.
 *
 * Idempotent per the state ledger — only (re)probes models never seen or last
 * checked over {@link STALE_MS} ago, unless `force`. Bounded concurrency keeps
 * it from hammering the provider. Writes a one-line summary to app_settings.
 */
export async function verifyFreeModels(opts?: {
  force?: boolean;
}): Promise<FreeModelHealthSummary> {
  const candidates = opencodeCloudFreeModels(); // raw, pre-filter
  const ledger = readHealthLedger();
  const now = Date.now();
  const toProbe = opts?.force
    ? candidates
    : candidates.filter((m) => {
        const h = ledger[m];
        return !h || now - Date.parse(h.checkedAt) > STALE_MS;
      });

  const results: Array<{ model: string; status: "ok" | "gone" | "error"; detail?: string }> = [];
  const CONCURRENCY = 5;
  let cursor = 0;
  const worker = async () => {
    while (cursor < toProbe.length) {
      const model = toProbe[cursor++];
      const r = await probeFreeModel(model);
      // Skip inconclusive probes (slow cold start) — never hide a working model
      // on a timeout; just leave it unchecked for the next pass.
      if (r.status !== "unknown") {
        results.push({ model, status: r.status, detail: r.detail });
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, toProbe.length) }, worker),
  );
  recordModelHealthBatch(results);

  const summary = summarizeHealth(candidates);
  await setSetting(FREE_MODEL_HEALTH_KEY, JSON.stringify(summary));
  return summary;
}

/** The last verify pass's tally, for the Settings panel (null if never run). */
export async function getFreeModelHealthSummary(): Promise<FreeModelHealthSummary | null> {
  const raw = await getSetting(FREE_MODEL_HEALTH_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as FreeModelHealthSummary;
  } catch {
    return null;
  }
}
