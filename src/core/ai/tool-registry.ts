import { z } from "zod";
import type { AiToolDef } from "@/core/modules/types.server";
import { serverModules } from "@/modules/registry.server";
import { notify } from "@/core/notify";
import { NOTIFICATION_LEVELS } from "@/core/db/schema/notifications";

/** Core tools available alongside module tools. */
const CORE_TOOLS: AiToolDef[] = [
  {
    name: "search.everything",
    description:
      "Semantic search across ALL the user's data — notes, knowledge base, tasks — by meaning, not just keywords. Use this first when asked about anything the user may have saved.",
    input: z.object({
      query: z.string().min(1),
      limit: z.number().int().min(1).max(20).default(8),
    }),
    async execute(input) {
      const { searchEverything } = await import("@/core/embeddings");
      const hits = await searchEverything(input.query, input.limit);
      return hits.map((h) => ({
        kind: h.kind,
        id: h.id,
        title: h.title,
        snippet: h.snippet,
      }));
    },
  },
  {
    name: "memory.update",
    description:
      "Update a persistent memory block (always-injected context: who_i_am, current_focus, preferences, active_projects, or a new label for a durable topic). Keep blocks concise — they have char budgets; replaced values are archived automatically.",
    input: z.object({
      label: z
        .string()
        .min(1)
        .max(40)
        .describe("Block label, snake_case (existing or new)"),
      value: z.string().min(1),
      mode: z.enum(["replace", "append"]).default("replace"),
      description: z
        .string()
        .optional()
        .describe("What this block holds (only used when creating a new one)"),
    }),
    async execute(input) {
      const { updateMemoryBlock } = await import("@/core/memory");
      const next = await updateMemoryBlock(
        input.label,
        input.value,
        input.mode,
        input.description,
      );
      return { updated: input.label, length: next.length };
    },
  },
  {
    name: "memory.remember",
    description:
      "Store a durable fact, decision, lesson, or event in long-tail memory (searchable later via memory.recall). Use for anything worth not re-learning: 'we decided X because Y', 'approach Z failed due to W'.",
    input: z.object({
      text: z.string().min(1).max(2000),
      kind: z.enum(["fact", "decision", "lesson", "event"]).default("fact"),
    }),
    async execute(input, ctx) {
      const { rememberEntry } = await import("@/core/memory");
      const row = await rememberEntry({
        kind: input.kind,
        text: input.text,
        source: ctx.agentRunId ? `agent-run:${ctx.agentRunId}` : "chat",
      });
      return { remembered: row.id };
    },
  },
  {
    name: "memory.recall",
    description:
      "Semantically search long-tail memory (past decisions, lessons, events, superseded context). Check here before redoing work or re-deciding something.",
    input: z.object({
      query: z.string().min(1),
      limit: z.number().int().min(1).max(20).default(6),
    }),
    async execute(input) {
      const { recallEntries } = await import("@/core/memory");
      return await recallEntries(input.query, input.limit);
    },
  },
  {
    name: "notify.send",
    description:
      "Send the user a notification (bell feed + Slack if configured). Use for reports, reminders, and anything the user should see without opening the app.",
    input: z.object({
      title: z.string().min(1).max(200),
      body: z.string().optional().describe("Longer text, markdown-ish"),
      level: z.enum(NOTIFICATION_LEVELS).default("info"),
      href: z
        .string()
        .optional()
        .describe("Optional in-app path to link, e.g. /m/tasks"),
    }),
    async execute(input, ctx) {
      const row = await notify({
        ...input,
        source: ctx.agentRunId ? `agent-run:${ctx.agentRunId}` : "chat",
      });
      return { sent: row.id };
    },
  },
];

/** All module-declared AI tools, keyed by their dotted name ("tasks.create"). */
export function getToolRegistry(): Map<string, AiToolDef> {
  const map = new Map<string, AiToolDef>();
  for (const t of CORE_TOOLS) map.set(t.name, t);
  for (const mod of serverModules) {
    for (const t of mod.aiTools) {
      if (map.has(t.name)) {
        throw new Error(`Duplicate AI tool name: ${t.name}`);
      }
      map.set(t.name, t);
    }
  }
  return map;
}

export function getAllTools(): AiToolDef[] {
  return [...getToolRegistry().values()];
}

/** Filter an allowlist (agent config) against the registry. */
export function getToolsByNames(names: string[]): AiToolDef[] {
  const reg = getToolRegistry();
  return names.flatMap((n) => {
    const t = reg.get(n);
    return t ? [t] : [];
  });
}
