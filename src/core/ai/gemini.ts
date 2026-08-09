import OpenAI from "openai";
import { z } from "zod";
import { getSetting } from "@/core/app-settings";
import type { AIEvent, AIProvider, AIRunOptions } from "./provider";
import { fromWireName, toWireName } from "./provider";

/**
 * Google Gemini via its OpenAI-compatible endpoint. Unlike ollama/nvidia (free,
 * guarded) this is a **metered** provider: it uses a Google AI Studio API key
 * the user pastes into Settings → Integrations (stored in app_settings, read at
 * call time — never from the environment, which subscriptionEnv strips). A
 * deliberate opt-in exception to the "subscription/local only" rule, so there is
 * no free-model guard here.
 */
const GEMINI_BASE =
  process.env.GEMINI_BASE_URL ??
  "https://generativelanguage.googleapis.com/v1beta/openai/";

/** Shown if the live model list can't be fetched (no key yet, or offline). */
const FALLBACK_MODELS = [
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
];

async function apiKey(): Promise<string> {
  const key = (await getSetting("gemini_api_key"))?.trim();
  if (!key) {
    throw new Error(
      "Gemini API key not set — add it in Settings → Integrations (Google AI Studio key)",
    );
  }
  return key;
}

async function client(): Promise<OpenAI> {
  return new OpenAI({ baseURL: GEMINI_BASE, apiKey: await apiKey() });
}

export const geminiProvider: AIProvider = {
  id: "gemini",

  async listModels() {
    try {
      const openai = await client();
      const res = await openai.models.list();
      const ids = res.data
        .map((m) => m.id.replace(/^models\//, ""))
        .filter((id) => id.startsWith("gemini"));
      return ids.length ? ids.sort() : FALLBACK_MODELS;
    } catch {
      // No key yet or the list call failed — offer the known-good defaults so
      // the picker still works; run() surfaces the real "key not set" error.
      return FALLBACK_MODELS;
    }
  },

  async *run(opts: AIRunOptions): AsyncIterable<AIEvent> {
    let openai: OpenAI;
    try {
      openai = await client();
    } catch (e) {
      yield { type: "error", message: String(e) };
      return;
    }

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
