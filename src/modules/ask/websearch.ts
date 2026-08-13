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
 * link policy) → one result per site → fetch the real page text (the Telegram
 * module's proven reader) → hand back as `web` sources the model can cite [n].
 *
 * Enable by setting `SEARXNG_URL` (e.g. https://host/searxng) in .env.local.
 * Unset ⇒ this is a no-op and Ask answers from the corpus alone (fail-open).
 */
import { fetchUrlText } from "@/modules/telegram/fetch";
import type { AskSource } from "./schema";
import { isLowQualityUrl } from "./links";

const SEARXNG_URL = (process.env.SEARXNG_URL ?? "").trim().replace(/\/$/, "");
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/** Is web enrichment configured at all? */
export function webSearchEnabled(): boolean {
  return SEARXNG_URL.length > 0;
}

interface SearxResult {
  url?: string;
  title?: string;
  content?: string;
}

/** Query SearXNG's JSON API. Best-effort: any failure yields []. */
async function searxng(query: string): Promise<SearxResult[]> {
  if (!SEARXNG_URL) return [];
  const u = new URL(`${SEARXNG_URL}/search`);
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

/**
 * Search the web and return up to `max` authoritative sources with their page
 * text, ready to append to the Ask context. `n` is assigned later by the caller
 * when it renumbers the full source list.
 */
export async function webSearchSources(
  query: string,
  opts?: { max?: number },
): Promise<AskSource[]> {
  const max = opts?.max ?? 3;
  const results = await searxng(query);
  if (!results.length) return [];

  // Keep only authoritative, free-to-read results; one per site for diversity.
  const seenHost = new Set<string>();
  const picked: Required<SearxResult>[] = [];
  for (const r of results) {
    if (!r.url) continue;
    if (isLowQualityUrl(r.url)) continue;
    let host: string;
    try {
      host = new URL(r.url).hostname.replace(/^www\./, "");
    } catch {
      continue;
    }
    if (seenHost.has(host)) continue;
    seenHost.add(host);
    picked.push({ url: r.url, title: r.title ?? r.url, content: r.content ?? "" });
    // Fetch a couple extra beyond `max` — some pages fetch empty and get dropped.
    if (picked.length >= max + 2) break;
  }
  if (!picked.length) return [];

  // Pull the real article text in parallel (falls back to the search snippet).
  const fetched = await Promise.all(
    picked.map(async (r) => {
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
      title: r.title,
      href: r.url,
      snippet: r.text.slice(0, 2500),
    }));
}
