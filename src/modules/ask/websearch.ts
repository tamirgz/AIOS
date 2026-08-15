/**
 * Web-search enrichment for Ask — free and self-hosted.
 *
 * The Ask engine answers from the user's own corpus; this adds a few CURRENT,
 * AUTHORITATIVE external sources so the answer isn't limited to what the local
 * model happens to remember. It queries a self-hosted SearXNG (a keyless meta-
 * search aggregator — Google/Bing/etc. behind one JSON API), so there is no
 * paid search API and no API key: cost is $0, exactly like the local model.
 *
 * Pipeline: SearXNG JSON → drop non-authoritative/paywalled results (the shared
 * link policy) → one result per site → RANK by authority tier so the best rise
 * to the top → fetch the real page text (the Telegram module's proven reader) →
 * hand back the top N as `web` sources the model can cite [n].
 *
 * Configure the endpoint with the `searxng_url` setting (Settings · Connections)
 * or the `SEARXNG_URL` env var. Neither set ⇒ no-op, Ask answers from the corpus
 * alone (fail-open).
 */
import { getSetting } from "@/core/app-settings";
import { fetchUrlText } from "@/modules/telegram/fetch";
import type { AskSource } from "./schema";
import { isLowQualityUrl } from "./links";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/** Setting (UI) wins over env; either can supply the SearXNG base URL. */
async function resolveSearxngUrl(): Promise<string> {
  const fromSetting = (await getSetting("searxng_url").catch(() => null))?.trim();
  const url = fromSetting || (process.env.SEARXNG_URL ?? "").trim();
  return url.replace(/\/$/, "");
}

/**
 * Authority tier of a URL — higher is better. This is what makes the top 5
 * "top notch": standards bodies and government pages outrank official vendor
 * docs, which outrank everything else that merely passed the quality gate.
 */
const GOV_STANDARDS =
  /(^|\.)(nist\.gov|csrc\.nist\.gov|iso\.org|ietf\.org|rfc-editor\.org|owasp\.org|mitre\.org|cve\.org|first\.org|cisa\.gov|sans\.org|enisa\.europa\.eu|europa\.eu|w3\.org|unicode\.org|iana\.org|pcisecuritystandards\.org)$/i;

/** Well-known primary vendor/tech domains whose own docs are authoritative. */
const VENDOR_DOCS =
  /(^|\.)(microsoft\.com|cisco\.com|cloudflare\.com|redhat\.com|kubernetes\.io|amazon\.com|aws\.amazon\.com|google\.com|cloud\.google\.com|ibm\.com|oracle\.com|paloaltonetworks\.com|crowdstrike\.com|fortinet\.com|splunk\.com|elastic\.co|hashicorp\.com|docker\.com|nvidia\.com|apple\.com|mozilla\.org|postgresql\.org|python\.org|nginx\.org|kernel\.org)$/i;

function authorityScore(hostname: string): number {
  const h = hostname.toLowerCase();
  if (/\.gov(\.[a-z]{2})?$/.test(h) || /\.mil$/.test(h) || GOV_STANDARDS.test(h))
    return 3;
  if (/^(docs|developer|learn|documentation)\./.test(h) || VENDOR_DOCS.test(h))
    return 2;
  return 1;
}

/**
 * Question/filler words to drop when deriving the distinctive terms of a query.
 * Keeps the search focused on the real subject and lets us reject off-topic
 * results (e.g. a dictionary defining the word "explain" in the question).
 */
const STOPWORDS = new Set([
  "the", "and", "for", "with", "from", "into", "each", "that", "this", "your",
  "you", "are", "was", "were", "has", "have", "had", "can", "could", "should",
  "would", "will", "about", "list", "give", "tell", "show", "explain",
  "describe", "compare", "define", "using", "use", "used", "what", "whats",
  "how", "why", "who", "whom", "when", "where", "which", "does", "did", "them",
  "they", "their", "there", "its", "also", "than", "then", "over", "under",
  "one", "two", "three", "four", "five", "six", "seven", "get", "got", "make",
  "many", "much", "some", "any", "all", "more", "most", "between", "within",
  "versus", "vs", "help", "need", "want", "know", "like", "such", "into",
]);

/** Distinctive terms (≥3 chars, not a stopword, not a bare number). */
function distinctiveTerms(query: string): string[] {
  return [
    ...new Set(
      query
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((t) => t.length >= 3 && !STOPWORDS.has(t) && !/^\d+$/.test(t)),
    ),
  ];
}

/** Strip NUL/C0 control chars — Postgres jsonb can't store them (error 22P05). */
function clean(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim();
}

interface SearxResult {
  url?: string;
  title?: string;
  content?: string;
}

/** Query SearXNG's JSON API. Best-effort: any failure yields []. */
async function searxng(query: string, base: string): Promise<SearxResult[]> {
  const u = new URL(`${base}/search`);
  u.searchParams.set("q", query);
  u.searchParams.set("format", "json");
  u.searchParams.set("categories", "general");
  u.searchParams.set("safesearch", "0");
  try {
    const res = await fetch(u, {
      headers: { "User-Agent": UA, Accept: "application/json" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: SearxResult[] };
    return Array.isArray(data.results) ? data.results : [];
  } catch {
    return [];
  }
}

interface Candidate {
  url: string;
  title: string;
  content: string;
  score: number;
}

/**
 * Query SearXNG and return authoritative, on-topic results ranked by authority
 * tier (no page fetch yet). Shared by the Ask enricher and the web.search tool.
 */
async function rankedCandidates(query: string, base: string): Promise<Candidate[]> {
  // Search the raw question — SearXNG's own relevance handles it best; reducing
  // it to keywords over-broadens (a lone "core" pulled in unrelated "core.*"
  // sites). The stopword list is instead used to judge relevance below.
  const terms = distinctiveTerms(query);
  const results = await searxng(query, base);
  if (!results.length) return [];

  // Keep only authoritative, free-to-read, ON-TOPIC results; one per site for
  // diversity; score each by authority tier. A top-notch source is squarely on
  // the subject: require it to hit at least two distinct query terms (one, if
  // the question only has one) — a single common-word hit is how filler sneaks in.
  const seenHost = new Set<string>();
  const candidates: Candidate[] = [];
  const need = Math.min(2, terms.length);
  for (const r of results) {
    if (!r.url || isLowQualityUrl(r.url)) continue;
    if (need > 0) {
      const hay = `${r.title ?? ""} ${r.content ?? ""}`.toLowerCase();
      if (terms.filter((t) => hay.includes(t)).length < need) continue;
    }
    let host: string;
    try {
      host = new URL(r.url).hostname.replace(/^www\./, "");
    } catch {
      continue;
    }
    if (seenHost.has(host)) continue;
    seenHost.add(host);
    candidates.push({
      url: r.url,
      title: r.title ?? r.url,
      content: r.content ?? "",
      score: authorityScore(host),
    });
  }
  // Rank by authority tier (stable sort keeps SearXNG's relevance within a tier).
  candidates.sort((a, b) => b.score - a.score);
  return candidates;
}

export interface WebSearchHit {
  title: string;
  url: string;
  snippet: string;
  authority: number; // 3 = standards/gov, 2 = official docs, 1 = other primary
}

/**
 * Web search as an agent tool — authority-ranked hits with SearXNG snippets, no
 * per-page fetch (fast). Empty if no SearXNG endpoint is configured.
 */
export async function searchWeb(
  query: string,
  opts?: { max?: number },
): Promise<WebSearchHit[]> {
  const max = opts?.max ?? 6;
  const base = await resolveSearxngUrl();
  if (!base) return [];
  const candidates = await rankedCandidates(query, base);
  return candidates.slice(0, max).map((c) => ({
    title: clean(c.title).slice(0, 200) || c.url,
    url: c.url,
    snippet: clean(c.content).slice(0, 600),
    authority: c.score,
  }));
}

/**
 * Search the web and return up to `max` authoritative sources (highest tier
 * first) with their page text, ready to append to the Ask context. `n` is
 * assigned later by the caller when it renumbers the full source list.
 */
export async function webSearchSources(
  query: string,
  opts?: { max?: number },
): Promise<AskSource[]> {
  const max = opts?.max ?? 5;
  const base = await resolveSearxngUrl();
  if (!base) return [];

  const candidates = await rankedCandidates(query, base);
  if (!candidates.length) return [];

  // Fetch a pool a bit larger than `max` — some pages fetch empty and get
  // dropped — then keep the top `max` that yielded real text, still ranked.
  const pool = candidates.slice(0, max + 3);
  const fetched = await Promise.all(
    pool.map(async (r) => {
      const text = await fetchUrlText(r.url);
      return { ...r, text: (text || r.content || "").trim() };
    }),
  );

  return fetched
    .filter((r) => r.text.length > 0)
    .slice(0, max)
    .map((r) => ({
      n: 0,
      kind: "web",
      title: clean(r.title).slice(0, 200) || r.url,
      href: r.url,
      snippet: clean(r.text).slice(0, 2500),
    }));
}
