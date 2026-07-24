import { z } from "zod";
import { resolveRoute } from "@/core/ai/routing";
import { db } from "@/core/db/client";
import type { KnowledgeInsight, KnowledgeItem } from "./schema";

const InsightSchema = z.object({
  summary: z
    .string()
    .describe("2-4 sentence summary of what this is and why it matters"),
  keyIdeas: z
    .array(z.string())
    .describe("The most interesting ideas/insights, each one sentence"),
  useCases: z
    .array(z.string())
    .describe(
      "Concrete ways the user could apply this for their own projects/business",
    ),
  quotes: z
    .array(z.string())
    .describe("Notable verbatim quotes or phrases worth keeping (may be empty)"),
  tags: z
    .array(z.string())
    .describe("3-6 short lowercase topic tags"),
  relevance: z
    .string()
    .describe("One sentence: how this connects to the user's stated note/goals"),
});

/** Fabric-style named enrichment patterns, per kind. */
const PATTERNS: Record<string, string> = {
  github:
    "Analyze this GitHub repository (metadata + README below). Extract what it does, its architecture ideas worth stealing, and CONCRETE use cases for the user's own purposes.",
  instagram:
    "Analyze this saved Instagram post (whatever public metadata is available plus the user's note). Extract the interesting substance the user wanted to keep.",
  tiktok:
    "Analyze this saved TikTok (oEmbed metadata: title/author, plus the user's note). Extract the interesting substance the user wanted to keep.",
  youtube:
    "Analyze this saved YouTube video (oEmbed metadata plus the user's note). Extract the interesting substance the user wanted to keep.",
  link: "Analyze this saved web page (extracted text below). Distill the substance — ignore navigation/boilerplate.",
  quote:
    "This is a quote the user saved. Interpret it: meaning, why it resonates, where it could be applied or cited.",
  text: "This is a free-form snippet the user saved. Distill and structure the interesting substance.",
};

export async function enrichItem(
  item: KnowledgeItem,
): Promise<KnowledgeInsight> {
  const route = await resolveRoute("knowledge.enrich");

  let captured: KnowledgeInsight | null = null;
  const submitTool = {
    name: "knowledge.submit",
    description:
      "Submit the final structured insight for this knowledge item. Call exactly once.",
    input: InsightSchema,
    execute: async (input: KnowledgeInsight) => {
      captured = input;
      return { saved: true };
    },
  };

  const material = [
    PATTERNS[item.kind] ?? PATTERNS.text,
    "",
    `KIND: ${item.kind}`,
    item.url ? `URL: ${item.url}` : null,
    item.note ? `USER'S NOTE (their intent for saving this): ${item.note}` : null,
    "",
    "RAW INPUT:",
    item.input.slice(0, 2000),
    item.raw ? "\nFETCHED MATERIAL:\n" + JSON.stringify(item.raw).slice(0, 12_000) : null,
    "",
    "Produce the insight and submit it via the knowledge.submit tool. Call the tool exactly once with your full analysis.",
  ]
    .filter((x) => x !== null)
    .join("\n");

  let finalText = "";
  for await (const event of route.provider.run({
    system:
      "You are the knowledge-enrichment engine of AIOS, the user's personal AI operating system. You turn saved links, repos and snippets into structured, actionable insight. Be specific and concrete; no filler.",
    messages: [{ role: "user", content: material }],
    tools: [submitTool],
    toolCtx: { db },
    model: route.model,
    maxTurns: 10,
    // Bound the call — without this a hung/looping model leaves the item stuck
    // in "enriching" forever. On timeout the provider aborts → the item errors
    // (visible + retryable) rather than hanging.
    signal: AbortSignal.timeout(120_000),
  })) {
    if (event.type === "done") finalText = event.text;
    if (event.type === "error") throw new Error(event.message);
  }

  if (captured) return captured;

  // Fallback: model answered in text instead of calling the tool.
  const jsonMatch = finalText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    const parsed = InsightSchema.safeParse(JSON.parse(jsonMatch[0]));
    if (parsed.success) return parsed.data;
  }
  throw new Error("enrichment produced no structured insight");
}
