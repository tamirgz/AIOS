/**
 * The cheap relevance gate. A small LOCAL model decides whether a post is worth
 * a (potentially expensive) routine run — so the channel's firehose is filtered
 * for ~free before anything costly happens. Which model is configurable via the
 * `source.relevance` route (default: qwen3:8b), so it's never hardwired.
 *
 * Why a small LLM and not embeddings: on an all-cybersecurity channel, embedding
 * similarity can't separate a product's niche (links/phishing/QR/CDR/files) from
 * generic cyber news — everything scores alike. A tiny local model reasons about
 * the niche and does; verified against real posts.
 */
import { db } from "@/core/db/client";

export interface Verdict {
  relevant: boolean;
  why: string;
}

export async function classifyRelevance(input: {
  text: string;
  linkedText?: string | null;
  criteria: string;
}): Promise<Verdict> {
  const { resolveRoute } = await import("@/core/ai/routing");
  const route = await resolveRoute("source.relevance");

  const system =
    `You filter posts for relevance to a specific domain. RELEVANT means: ${input.criteria}\n` +
    "Everything outside that domain — even if it's still cybersecurity (generic ransomware infrastructure, " +
    "OT/ICS attacks, unrelated CVEs), and anything off-topic (memes, promos, hardware news) — is NOT relevant. " +
    'Reply with ONLY compact JSON: {"relevant": true|false, "why": "<=8 words"}.';

  const body =
    `POST:\n${input.text.slice(0, 1500)}` +
    (input.linkedText ? `\n\nLINKED ARTICLE:\n${input.linkedText.slice(0, 1500)}` : "");

  let out = "";
  try {
    for await (const ev of route.provider.run({
      system,
      // `/no_think` keeps a reasoning model fast for a yes/no; harmless elsewhere.
      messages: [{ role: "user", content: `/no_think\n${body}` }],
      tools: [],
      toolCtx: { db },
      model: route.model,
      maxTurns: 1,
    })) {
      if (ev.type === "text") out += ev.text;
      else if (ev.type === "done" && ev.text) out = ev.text;
      else if (ev.type === "error") throw new Error(ev.message);
    }
  } catch (e) {
    // If the gate can't run, fail OPEN toward review rather than dropping a
    // possibly-important post: mark relevant with the reason, let the human see.
    return { relevant: true, why: `gate error: ${e instanceof Error ? e.message : String(e)}`.slice(0, 60) };
  }

  const m = out.match(/\{[\s\S]*\}/);
  if (m) {
    try {
      const o = JSON.parse(m[0]) as Partial<Verdict>;
      return { relevant: !!o.relevant, why: String(o.why ?? "").slice(0, 80) };
    } catch {
      /* fall through */
    }
  }
  // Unparseable → don't silently drop; surface for review.
  return { relevant: true, why: "gate returned no verdict" };
}
