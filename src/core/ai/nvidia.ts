import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import OpenAI from "openai";
import { z } from "zod";
import type { AIEvent, AIProvider, AIRunOptions } from "./provider";
import { fromWireName, toWireName } from "./provider";

// Free-tier NVIDIA cloud (build.nvidia.com), OpenAI-compatible. Free-only by
// construction: run() refuses any model not confirmed $0 in opencode's pricing
// catalog, fail-closed (missing catalog ⇒ refuse everything), so a periodic
// agent on this provider can never bill — matching the Workbench guard.
const NVIDIA_BASE =
  process.env.NVIDIA_BASE_URL ?? "https://integrate.api.nvidia.com/v1";
const CATALOG = join(homedir(), ".cache", "opencode", "models.json");

function client() {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) throw new Error("NVIDIA_API_KEY is not set");
  return new OpenAI({ baseURL: NVIDIA_BASE, apiKey });
}

let freeCache: { at: number; ids: Set<string> } | null = null;

/** Model ids priced at $0 (in+out) with tool-calling, from opencode's DB. */
function freeToolModels(): Set<string> {
  if (freeCache && Date.now() - freeCache.at < 60_000) return freeCache.ids;
  const ids = new Set<string>();
  try {
    const doc = JSON.parse(readFileSync(CATALOG, "utf8")) as Record<
      string,
      { models?: Record<string, { cost?: { input?: number; output?: number }; tool_call?: boolean }> }
    >;
    const models = doc.nvidia?.models ?? {};
    for (const [id, m] of Object.entries(models)) {
      const c = m.cost ?? {};
      if ((c.input ?? 0) === 0 && (c.output ?? 0) === 0 && m.tool_call) ids.add(id);
    }
  } catch {
    // fail-closed: no catalog ⇒ empty set ⇒ every model is refused
  }
  freeCache = { at: Date.now(), ids };
  return ids;
}

/** Throws unless the model is a confirmed-free tool-capable NVIDIA model. */
export function assertFreeNvidiaModel(model: string): void {
  if (!freeToolModels().has(model)) {
    throw new Error(
      `refusing NVIDIA model "${model}" — not confirmed free ($0) in the pricing catalog. The agent layer runs free models only.`,
    );
  }
}

export const nvidiaProvider: AIProvider = {
  id: "nvidia",

  async listModels() {
    // Only ever surface the free + tool-capable set (never the paid models).
    return [...freeToolModels()].sort();
  },

  async *run(opts: AIRunOptions): AsyncIterable<AIEvent> {
    try {
      assertFreeNvidiaModel(opts.model); // fail-closed before any network call
    } catch (e) {
      yield { type: "error", message: String(e) };
      return;
    }

    const openai = client();
    const maxTurns = opts.maxTurns ?? 8;

    const tools = opts.tools.map((t) => ({
      type: "function" as const,
      function: {
        name: toWireName(t.name),
        description: t.description,
        parameters: z.toJSONSchema(t.input) as Record<string, unknown>,
      },
    }));

    const messages: OpenAI.ChatCompletionMessageParam[] = [
      ...(opts.system ? [{ role: "system" as const, content: opts.system }] : []),
      ...opts.messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    let finalText = "";
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      for (let turn = 0; turn < maxTurns; turn++) {
        const stream = await openai.chat.completions.create(
          {
            model: opts.model,
            messages,
            tools: tools.length ? tools : undefined,
            stream: true,
            stream_options: { include_usage: true },
          },
          { signal: opts.signal },
        );

        let turnText = "";
        const toolCallAcc = new Map<
          number,
          { id: string; name: string; args: string }
        >();

        for await (const chunk of stream) {
          const usage = chunk.usage;
          if (usage) {
            inputTokens += usage.prompt_tokens ?? 0;
            outputTokens += usage.completion_tokens ?? 0;
          }
          const delta = chunk.choices[0]?.delta;
          if (!delta) continue;
          if (delta.content) {
            turnText += delta.content;
            yield { type: "text", text: turnText };
          }
          for (const tc of delta.tool_calls ?? []) {
            const acc = toolCallAcc.get(tc.index) ?? { id: "", name: "", args: "" };
            if (tc.id) acc.id = tc.id;
            if (tc.function?.name) acc.name += tc.function.name;
            if (tc.function?.arguments) acc.args += tc.function.arguments;
            toolCallAcc.set(tc.index, acc);
          }
        }

        if (turnText) finalText = turnText;

        const calls = [...toolCallAcc.values()].filter((c) => c.name);
        if (calls.length === 0) break;

        messages.push({
          role: "assistant",
          content: turnText || null,
          tool_calls: calls.map((c) => ({
            id: c.id || `call_${c.name}`,
            type: "function" as const,
            function: { name: c.name, arguments: c.args || "{}" },
          })),
        });
        for (const call of calls) {
          const name = fromWireName(call.name);
          const def = opts.tools.find((t) => t.name === name);
          let result: unknown;
          if (!def) {
            result = { error: `unknown tool ${name}` };
          } else {
            try {
              const input = def.input.parse(JSON.parse(call.args || "{}"));
              yield { type: "tool_call", name, input };
              result = await def.execute(input, opts.toolCtx);
            } catch (e) {
              result = { error: String(e) };
            }
          }
          yield { type: "tool_result", name, result };
          messages.push({
            role: "tool",
            tool_call_id: call.id || `call_${call.name}`,
            content: JSON.stringify(result ?? null),
          });
        }
      }

      yield { type: "usage", inputTokens, outputTokens };
      yield { type: "done", text: finalText };
    } catch (e) {
      yield { type: "error", message: String(e) };
    }
  },
};
