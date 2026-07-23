// No `server-only` import: this module is reached by the agent worker (via
// engine.ts), which runs under plain tsx where that package throws. Server-
// only by convention, like the rest of the module's server code.
import { ollamaProvider } from "@/core/ai/ollama";

/**
 * The free-model catalog for CLI executors.
 *
 * Policy (Tamir, 2026-07-23): opencode, pi, aider and any future CLI agent may
 * use models from their library **only when those models are free**. "Free" in
 * practice means the local Ollama library — no per-token bill, no metered key
 * (which `subscriptionEnv` strips anyway). Each executor's command template
 * wraps a bare Ollama tag with its own provider prefix (opencode `ollama/…`,
 * pi `--provider ollama`, aider `ollama_chat/…`), so one bare tag serves all.
 *
 * Cloud "free tiers" (e.g. opencode-zen `*-free`) are deliberately excluded:
 * they need an external login, can't be verified here, and a provider can
 * change what "free" means. Local is the only free we can guarantee.
 */

/** Models that embed rather than chat — never useful as a coding executor. */
const EMBEDDING_HINTS = ["embed", "bge-", "nomic-"];

function isEmbeddingModel(name: string): boolean {
  const n = name.toLowerCase();
  return EMBEDDING_HINTS.some((h) => n.includes(h));
}

/**
 * Metered-provider markers. A CLI executor's model must never look like one:
 * these reach a paid API, which the free-only policy forbids. Bare Ollama tags
 * (qwen3-coder:30b, gemma4:e4b…) never match.
 */
const METERED_PATTERNS = [
  /(^|\/)gpt-/i,
  /(^|\/)o[1-9]/i,
  /(^|\/)claude-/i,
  /(^|\/)gemini/i,
  /\bopenai\//i,
  /\banthropic\//i,
  /\bgoogle\//i,
  /\bazure\//i,
  /\bnvidia\//i,
];

export function isMeteredModel(model: string): boolean {
  return METERED_PATTERNS.some((re) => re.test(model));
}

/**
 * The installed Ollama models a CLI executor may use, embedding models
 * filtered out. Empty when Ollama is unreachable — the caller degrades to a
 * free-text field rather than blocking.
 */
export async function listFreeModels(): Promise<string[]> {
  try {
    const models = await ollamaProvider.listModels();
    return models.filter((m) => !isEmbeddingModel(m)).sort();
  } catch {
    return [];
  }
}

/**
 * Guard used at execution time. A CLI executor's model must be free; a metered
 * spec is refused with a message rather than silently billed. A bare/local tag
 * is always allowed (the template forces a local provider around it anyway).
 */
export function assertFreeModel(model: string | null | undefined): void {
  if (model && isMeteredModel(model)) {
    throw new Error(
      `"${model}" is a metered model. Local executors are restricted to free models (local Ollama) — pick one from the library, or run this as a "code" task on Claude.`,
    );
  }
}
