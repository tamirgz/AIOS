// No `server-only` import: this module is reached by the agent worker (via
// engine.ts), which runs under plain tsx where that package throws. Server-
// only by convention, like the rest of the module's server code.
import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { ollamaProvider } from "@/core/ai/ollama";

const exec = promisify(execFile);

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

function opencodeBin(): string {
  const p = join(homedir(), ".opencode", "bin", "opencode");
  return existsSync(p) ? p : "opencode";
}

/**
 * The FREE cloud models opencode can currently reach: every model it lists
 * (reflecting the user's connected keys) that opencode prices at $0 and that
 * is a chat/coding model. Big Pickle and the free Nvidia coders qualify; the
 * paid deepseek-v4 / GPT-5 / Claude ones do not.
 */
async function opencodeCloudFreeModels(): Promise<string[]> {
  try {
    const { stdout } = await exec(opencodeBin(), ["models"], {
      timeout: 15_000,
      maxBuffer: 4 * 1024 * 1024,
    });
    return stdout
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .filter((m) => !NON_CHAT.test(m) && pricedFree(m) === true)
      .sort();
  } catch {
    return [];
  }
}

/**
 * The free models a given executor may use, in the namespace its command
 * template expects. opencode runs `--model {{model}}` with a full spec, so it
 * gets `ollama/<tag>` for local plus its $0 cloud models; pi and aider wrap a
 * bare Ollama tag in their own provider flag, so they get the bare local tags.
 */
export async function listFreeModelsFor(executorId: string): Promise<string[]> {
  const local = await localOllamaModels();
  if (executorId === "opencode") {
    const cloud = await opencodeCloudFreeModels();
    return [...local.map((t) => `ollama/${t}`), ...cloud];
  }
  return local;
}

/** Free models keyed by executor id — for the pickers, built in one pass. */
export async function listFreeModelsByExecutor(
  executorIds: string[],
): Promise<Record<string, string[]>> {
  const local = await localOllamaModels();
  const wantsOpencode = executorIds.includes("opencode");
  const cloud = wantsOpencode ? await opencodeCloudFreeModels() : [];

  const out: Record<string, string[]> = {};
  for (const id of executorIds) {
    out[id] =
      id === "opencode"
        ? [...local.map((t) => `ollama/${t}`), ...cloud]
        : local;
  }
  return out;
}
