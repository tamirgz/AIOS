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
      "Update a persistent memory block (who_i_am, current_focus, preferences, active_projects). Use whenever you learn something durable about the user or their work. Keep blocks concise — they have char budgets.",
    input: z.object({
      label: z.enum([
        "who_i_am",
        "current_focus",
        "preferences",
        "active_projects",
      ]),
      value: z.string().min(1),
      mode: z.enum(["replace", "append"]).default("replace"),
    }),
    async execute(input) {
      const { updateMemoryBlock } = await import("@/core/memory");
      const next = await updateMemoryBlock(input.label, input.value, input.mode);
      return { updated: input.label, length: next.length };
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
