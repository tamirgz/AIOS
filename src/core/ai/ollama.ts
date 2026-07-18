import OpenAI from "openai";
import { z } from "zod";
import type {
  AIEvent,
  AIProvider,
  AIRunOptions,
} from "./provider";
import { fromWireName, toWireName } from "./provider";

const OLLAMA_BASE = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";

function client() {
  return new OpenAI({ baseURL: `${OLLAMA_BASE}/v1`, apiKey: "ollama" });
}

export const ollamaProvider: AIProvider = {
  id: "ollama",

  async listModels() {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) throw new Error(`ollama /api/tags → ${res.status}`);
    const data = (await res.json()) as { models?: { name: string }[] };
    return (data.models ?? []).map((m) => m.name);
  },

  async *run(opts: AIRunOptions): AsyncIterable<AIEvent> {
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
      ...(opts.system
        ? [{ role: "system" as const, content: opts.system }]
        : []),
      ...opts.messages.map((m) => ({ role: m.role, content: m.content })),
    ];

    let finalText = "";
    let inputTokens = 0;
    let outputTokens = 0;

    try {
      for (let turn = 0; turn < maxTurns; turn++) {
        const res = await openai.chat.completions.create(
          {
            model: opts.model,
            messages,
            tools: tools.length ? tools : undefined,
          },
          { signal: opts.signal },
        );

        inputTokens += res.usage?.prompt_tokens ?? 0;
        outputTokens += res.usage?.completion_tokens ?? 0;

        const msg = res.choices[0]?.message;
        if (!msg) break;

        if (msg.content) {
          finalText = msg.content;
          yield { type: "text", text: msg.content };
        }

        const calls = msg.tool_calls ?? [];
        if (calls.length === 0) break;

        messages.push(msg);
        for (const call of calls) {
          if (call.type !== "function") continue;
          const name = fromWireName(call.function.name);
          const def = opts.tools.find((t) => t.name === name);
          let result: unknown;
          if (!def) {
            result = { error: `unknown tool ${name}` };
          } else {
            try {
              const input = def.input.parse(
                JSON.parse(call.function.arguments || "{}"),
              );
              yield { type: "tool_call", name, input };
              result = await def.execute(input, opts.toolCtx);
            } catch (e) {
              result = { error: String(e) };
            }
          }
          yield { type: "tool_result", name, result };
          messages.push({
            role: "tool",
            tool_call_id: call.id,
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
