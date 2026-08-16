/**
 * Apple MLX runtime provider — talks OpenAI-compatible HTTP to a running
 * `mlx_lm.server` (`mlx_lm.server --model <hf-id-or-path> --port 8080`).
 *
 * Why: measured ~1.9× the tokens/sec of Ollama's GGUF engine for the same model
 * on Apple silicon, because MLX runs the model natively. AIOS routes local work
 * through Ollama by default; point a route at the `mlx` provider to serve an
 * MLX-format model through this instead.
 *
 * Local + free (no key), so it's classified `local` (never in CLOUD_PROVIDERS).
 * Configure the endpoint with the `mlx_base_url` setting (Settings · Connections)
 * or the `MLX_BASE_URL` env var; defaults to mlx_lm.server's `http://localhost:8080/v1`.
 */
import type { AIProvider } from "./provider";
import { runOpenAICompatible } from "./openai-compat";

async function mlxBase(): Promise<string> {
  const { getSetting } = await import("@/core/app-settings");
  const fromSetting = (await getSetting("mlx_base_url").catch(() => null))?.trim();
  const base = fromSetting || process.env.MLX_BASE_URL || "http://localhost:8080/v1";
  return base.replace(/\/$/, "");
}

export const mlxProvider: AIProvider = {
  id: "mlx",

  async listModels() {
    const base = await mlxBase();
    const res = await fetch(`${base}/models`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error(`mlx_lm.server ${base}/models → ${res.status}`);
    const data = (await res.json()) as { data?: { id: string }[] };
    return (data.data ?? []).map((m) => m.id);
  },

  async *run(opts) {
    const base = await mlxBase();
    yield* runOpenAICompatible(base, "mlx", opts);
  },
};
