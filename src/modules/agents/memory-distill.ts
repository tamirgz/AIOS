import type { ModuleJob } from "@/core/modules/types.server";
import { db } from "@/core/db/client";
import {
  rememberEntry,
  reviewEntries,
  updateMemoryBlock,
} from "@/core/memory";

/**
 * The learning engine: weekly, distills recent EPISODIC events into durable
 * SEMANTIC facts and PROCEDURAL rules (episodic → semantic/procedural), and
 * rebuilds the injected `operating_rules` block from the current top rules.
 *
 * Runs on a FREE LOCAL model — memory work is periodic and must never bill.
 * Conservative + grounded (every item must be supported by real events),
 * bounded (≤3 each), and deduped by rememberEntry, so it can't hallucinate a
 * flood of rules or grow the injected snapshot.
 */
const DISTILL_MODEL = "qwen3-coder:30b"; // local, free

async function llmJson(system: string, user: string): Promise<unknown | null> {
  const { providers } = await import("@/core/ai/routing");
  let text = "";
  try {
    for await (const ev of providers.ollama.run({
      system,
      messages: [{ role: "user", content: user }],
      tools: [],
      toolCtx: { db },
      model: DISTILL_MODEL,
      maxTurns: 1,
    })) {
      if (ev.type === "done") text = ev.text;
    }
  } catch {
    return null;
  }
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

export async function distillMemory(): Promise<{ policies: number; facts: number }> {
  // Genuine events only — the `superseded` block-dumps (also episodic) are noise.
  const events = (await reviewEntries("episodic", 80)).filter((e) => e.kind === "event");
  const procedural = await reviewEntries("procedural", 20);
  if (events.length < 3) return { policies: 0, facts: 0 }; // nothing to distill yet

  const material = [
    "RECENT EPISODIC EVENTS (what happened):",
    ...events.map((e) => `- ${e.text}`),
    "",
    "EXISTING PROCEDURAL RULES (do NOT duplicate these):",
    ...procedural.map((p) => `- ${p.text}`),
  ].join("\n");
  const system = [
    "You distill a personal operating system's long-tail memory into durable, high-signal knowledge. From the recent EVENTS, extract ONLY genuinely RECURRING patterns or stable truths. Be conservative — most runs yield little or nothing.",
    'Output STRICT JSON and nothing else: {"policies": string[], "facts": string[]}',
    "- policies: at most 3 operating rules like 'When X, do Y', each grounded in the events (e.g. a recurring failure → a rule that avoids it). Never restate an existing rule.",
    "- facts: at most 3 stable truths worth remembering long-term.",
    "Empty arrays if nothing qualifies. Never invent — every item must be supported by the events above.",
  ].join("\n");

  const out = (await llmJson(system, material)) as
    | { policies?: unknown; facts?: unknown }
    | null;
  let policies = 0;
  let facts = 0;
  const pol = Array.isArray(out?.policies) ? out!.policies : [];
  const fac = Array.isArray(out?.facts) ? out!.facts : [];
  for (const p of pol.slice(0, 3)) {
    if (typeof p === "string" && p.trim().length > 10) {
      await rememberEntry({ kind: "policy", source: "distill", text: p.trim() }).catch(() => {});
      policies++;
    }
  }
  for (const f of fac.slice(0, 3)) {
    if (typeof f === "string" && f.trim().length > 10) {
      await rememberEntry({ kind: "fact", source: "distill", text: f.trim() }).catch(() => {});
      facts++;
    }
  }
  // Rebuild the injected procedural block from the current top rules (bounded).
  if (policies) {
    const rules = await reviewEntries("procedural", 8);
    const body = rules.map((r) => `- ${r.text}`).join("\n").slice(0, 1000);
    if (body) {
      await updateMemoryBlock(
        "operating_rules",
        body,
        "replace",
        "Learned operating rules distilled from experience.",
      ).catch(() => {});
    }
  }
  return { policies, facts };
}

export const memoryDistillJobs: ModuleJob[] = [
  {
    channel: "memory_distill",
    schedule: "0 4 * * 0", // Sunday 04:00, after the daily maintenance sweep
    handle: async () => {
      await distillMemory();
    },
  },
];
