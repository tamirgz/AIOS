/**
 * The "Ask" engine — cited Q&A strictly over the user's own indexed corpus
 * (notes, knowledge, Obsidian vault, ideas, tasks, and Notion when connected).
 * Retrieval = the existing semantic search; synthesis = an Ollama-first model
 * that must cite sources inline as [n]. Worker-safe (no next/cache).
 */
import { resolveRoute } from "@/core/ai/routing";
import { searchEverything } from "@/core/embeddings";
import { db } from "@/core/db/client";

export interface AskSource {
  n: number;
  kind: string;
  title: string;
  href: string;
  snippet: string | null;
}

export interface AskAnswer {
  answer: string;
  sources: AskSource[];
  model: string;
}

export async function answerQuestion(query: string): Promise<AskAnswer> {
  const q = query.trim();
  if (!q) return { answer: "", sources: [], model: "" };

  const hits = await searchEverything(q, 10);
  if (hits.length === 0) {
    return {
      answer:
        "I couldn't find anything in your saved data (notes, knowledge, vault, ideas, tasks) about that.",
      sources: [],
      model: "",
    };
  }

  const numbered = hits.map((h, i) => ({ ...h, n: i + 1 }));
  const context = numbered
    .map((h) => `[${h.n}] (${h.kind}) ${h.title}\n${h.snippet ?? ""}`)
    .join("\n\n");

  const route = await resolveRoute("ask");
  const material = [
    `QUESTION: ${q}`,
    "",
    "SOURCES (from the user's own saved data):",
    context,
    "",
    "Answer the question using ONLY these sources. Cite the ones you use inline as [1], [2], etc. If the sources don't actually answer it, say so plainly rather than guessing. Be concise and specific — a few sentences, not an essay.",
  ].join("\n");

  let answer = "";
  for await (const ev of route.provider.run({
    system:
      "You are the Ask engine of AIOS, the user's personal AI operating system. You answer strictly from the user's own saved notes, knowledge, vault, ideas and tasks — never outside knowledge — and you always cite the sources you used inline as [n]. If the provided sources don't answer the question, say so.",
    messages: [{ role: "user", content: material }],
    tools: [],
    toolCtx: { db },
    model: route.model,
    maxTurns: 1,
    signal: AbortSignal.timeout(90_000),
  })) {
    if (ev.type === "text") answer = ev.text;
    if (ev.type === "done") answer = ev.text || answer;
    if (ev.type === "error") throw new Error(ev.message);
  }

  return {
    answer: answer.trim(),
    sources: numbered.map((h) => ({
      n: h.n,
      kind: h.kind,
      title: h.title,
      href: h.href,
      snippet: h.snippet,
    })),
    model: `${route.providerId}/${route.model}`,
  };
}
