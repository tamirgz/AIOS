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
        // Streaming: yield text as it generates — a 30B local model can take
        // many seconds per turn, and a silent wait reads as a hang in the UI.
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
            const acc = toolCallAcc.get(tc.index) ?? {
              id: "",
              name: "",
              args: "",
            };
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
