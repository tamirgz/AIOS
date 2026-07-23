import type { AiToolContext, AiToolDef } from "@/core/modules/types.server";

export type AIEvent =
  | { type: "text"; text: string }
  | { type: "tool_call"; name: string; input: unknown }
  | { type: "tool_result"; name: string; result: unknown }
  | { type: "usage"; inputTokens: number; outputTokens: number }
  | { type: "done"; text: string }
  | { type: "error"; message: string };

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AIRunOptions {
  system?: string;
  messages: ChatMessage[];
  tools: AiToolDef[];
  toolCtx: AiToolContext;
  model: string;
  maxTurns?: number;
  signal?: AbortSignal;
}

export interface AIProvider {
  id: "anthropic" | "ollama" | "nvidia";
  listModels(): Promise<string[]>;
  run(opts: AIRunOptions): AsyncIterable<AIEvent>;
}

/**
 * Tool names are dotted internally ("tasks.create") but both the OpenAI
 * function-calling API and MCP restrict names to [a-zA-Z0-9_-], so dots are
 * replaced on the wire and mapped back on the way in.
 */
export const toWireName = (name: string) => name.replaceAll(".", "__");
export const fromWireName = (name: string) => name.replaceAll("__", ".");
