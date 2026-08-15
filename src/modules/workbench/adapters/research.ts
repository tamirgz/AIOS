/**
 * Research adapter — a tool-free direct completion.
 *
 * A research task's job is to READ provided material and WRITE an analysis. It
 * needs no file/shell/web tools, and opencode's agentic loop actively harms it:
 * the model ignores the pre-fetched article and instead re-fetches the URL
 * itself (hitting the same 403 bot-wall), dumps output into stray files, or
 * hangs when the tools are denied. So for research we skip opencode entirely and
 * call the model directly over the OpenAI-compatible chat API — the article is
 * already in the prompt (engine's gatherResearchContext), the reply IS the
 * deliverable. Free: NIM ($0 tier) or local Ollama, same as before.
 */
import type { Adapter, AdapterResult } from "./types";

const RESEARCH_SYSTEM =
  "You are a meticulous research analyst. You are given SOURCE MATERIAL that has already been fetched for you (an article and related context) plus a task. Produce the COMPLETE analysis the task asks for, written directly as your reply in clean markdown — use tables and lists where they make the answer clearer. Base the substance strictly on the provided material plus your own domain expertise. The article is included below; never say you cannot access it or ask for it, and do not mention tools, fetching, or files. Be thorough and concrete.";

/** Map an opencode-style model id to an OpenAI-compatible endpoint + key. */
function resolveEndpoint(model: string): {
  base: string;
  apiKey: string;
  apiModel: string;
} {
  if (model.startsWith("nvidia/")) {
    // NVIDIA NIM free tier — the same $0 key opencode uses. The provider prefix
    // is opencode's; the NIM API wants the bare `<vendor>/<model>` id.
    return {
      base: "https://integrate.api.nvidia.com/v1",
      apiKey: process.env.NVIDIA_API_KEY ?? "",
      apiModel: model.slice("nvidia/".length),
    };
  }
  // Local Ollama (bare tag or `ollama/<tag>`), via its OpenAI-compatible port.
  const ollama = (process.env.OLLAMA_BASE_URL ?? "http://localhost:11434").replace(/\/$/, "");
  return {
    base: `${ollama}/v1`,
    apiKey: "ollama",
    apiModel: model.startsWith("ollama/") ? model.slice("ollama/".length) : model,
  };
}

export const researchAdapter: Adapter = {
  id: "research",
  async run(ctx, emit) {
    const model = ctx.model ?? "";
    if (!model) return { ok: false, error: "no model set for the research task" };
    const { base, apiKey, apiModel } = resolveEndpoint(model);
    if (base.includes("nvidia") && !apiKey) {
      return {
        ok: false,
        error:
          "NVIDIA_API_KEY isn't set — it's needed for NIM research models. Add it, or pick a local Ollama model.",
      };
    }

    await emit({ type: "status", payload: { phase: "analyzing", model: apiModel } });
    try {
      const res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: apiModel,
          messages: [
            { role: "system", content: RESEARCH_SYSTEM },
            { role: "user", content: ctx.prompt },
          ],
          temperature: 0.3,
          max_tokens: 6000,
          stream: false,
        }),
        signal: ctx.signal,
      });
      if (!res.ok) {
        const body = (await res.text()).slice(0, 300);
        return { ok: false, exitCode: 1, error: `${apiModel} → HTTP ${res.status}: ${body}` };
      }
      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      const text = (data.choices?.[0]?.message?.content ?? "").trim();
      if (!text) return { ok: false, error: "the model returned an empty analysis" };

      await emit({ type: "text", payload: { text: text.slice(0, 16000) } });
      await emit({
        type: "usage",
        payload: {
          tokens: {
            input: data.usage?.prompt_tokens ?? 0,
            output: data.usage?.completion_tokens ?? 0,
          },
          cost: 0,
        },
      });
      return {
        ok: true,
        exitCode: 0,
        result: text.slice(0, 16000),
        inputTokens: data.usage?.prompt_tokens,
        outputTokens: data.usage?.completion_tokens,
      };
    } catch (e) {
      if (ctx.signal.aborted) return { ok: false, error: "cancelled" };
      return { ok: false, error: String(e).slice(0, 300) };
    }
  },
};
