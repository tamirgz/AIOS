/**
 * Research pre-fetch for Workbench.
 *
 * A "research" task usually names one or more URLs ("review this article…").
 * The executors are file/code agents with no reliable way to fetch a page —
 * and many sources (Akamai, enterprise blogs) bot-wall a plain server fetch
 * with a 403. So instead of hoping the model has a working web tool, AIOS reads
 * the article(s) up front and hands the text to the run:
 *
 *   1. local fetch (the hardened `fetchUrlText`) — private, no third party;
 *   2. if that's blocked/thin, a keyless READER PROXY (default r.jina.ai, which
 *      renders the page and returns clean markdown past the bot wall). Only the
 *      already-public URL is sent out; no API key, no cost. Configurable via the
 *      `reader_proxy_url` setting (set it to "off" to stay local-only, or point
 *      it at a self-hosted reader).
 *
 * It also pulls a few RELATED authoritative sources via SearXNG (the same
 * enrichment Ask uses) so "research all related" has material. The article text
 * is both injected into the prompt and written to `.aios/sources/` so a
 * file-oriented executor can read it too.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getSetting } from "@/core/app-settings";
import { fetchUrlText } from "@/modules/telegram/fetch";
import { webSearchSources } from "@/modules/ask/websearch";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const DEFAULT_READER = "https://r.jina.ai/";
const MIN_LOCAL_CHARS = 400; // below this, treat the local fetch as blocked/thin
const MAX_ARTICLE_CHARS = 12_000; // per-article cap injected into the prompt

interface Article {
  url: string;
  title: string;
  text: string;
}

function clean(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim();
}

/** Human-ish title from a URL slug when we don't have a real one. */
function titleFromUrl(url: string): string {
  try {
    const seg = new URL(url).pathname.split("/").filter(Boolean).pop() ?? url;
    return decodeURIComponent(seg).replace(/[-_]+/g, " ").replace(/\.\w+$/, "").trim() || url;
  } catch {
    return url;
  }
}

export function extractUrls(text: string): string[] {
  const re = /https?:\/\/[^\s<>()"'`]+/gi;
  return [...new Set((text.match(re) ?? []).map((u) => u.replace(/[.,;:)\]]+$/, "")))];
}

/** Reader-proxy base, or null if the user turned it off. */
async function resolveReaderProxy(): Promise<string | null> {
  const v = (await getSetting("reader_proxy_url").catch(() => null))?.trim();
  if (v && /^(off|none|disabled|false|no)$/i.test(v)) return null;
  const base = v || (process.env.READER_PROXY_URL ?? "").trim() || DEFAULT_READER;
  return base.endsWith("/") ? base : `${base}/`;
}

/** Fetch clean article text via the reader proxy (r.jina.ai-style output). */
async function fetchViaReader(proxy: string, url: string): Promise<Article | null> {
  try {
    const res = await fetch(`${proxy}${url}`, {
      headers: { "User-Agent": UA, Accept: "text/plain, text/markdown, */*" },
      redirect: "follow",
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return null;
    const body = clean(await res.text());
    if (!body) return null;
    // r.jina.ai prefixes "Title:", "URL Source:", "Markdown Content:". Split the
    // real content off the header; fall back to the whole body.
    const titleM = body.match(/^Title:\s*(.+)$/m);
    const marker = body.indexOf("Markdown Content:");
    const text = (marker >= 0 ? body.slice(marker + "Markdown Content:".length) : body).trim();
    if (text.length < 200) return null;
    return { url, title: titleM?.[1]?.trim() || titleFromUrl(url), text };
  } catch {
    return null;
  }
}

/** Read one article: local fetch first, reader-proxy fallback if blocked/thin. */
export async function readArticle(url: string): Promise<Article | null> {
  const local = clean(await fetchUrlText(url));
  if (local.length >= MIN_LOCAL_CHARS) {
    return { url, title: titleFromUrl(url), text: local };
  }
  const proxy = await resolveReaderProxy();
  if (proxy) {
    const read = await fetchViaReader(proxy, url);
    if (read && read.text.length > local.length) return read;
  }
  return local ? { url, title: titleFromUrl(url), text: local } : null;
}

export interface ResearchContext {
  block: string; // prompt section to append (empty if nothing gathered)
  articles: number;
  related: number;
  knowledge: number;
}

/**
 * Assemble everything relevant to the task: the user's OWN corpus (semantic
 * search across all sources — notes, knowledge, vault, tasks, mail, calendar,
 * past answers…), any article URLs named in the prompt, and related web
 * coverage. Returns a prompt block carrying it inline. Best-effort throughout:
 * any failure just yields less context, never throws.
 */
export async function gatherResearchContext(
  prompt: string,
  workdir: string,
): Promise<ResearchContext> {
  // 1) The user's own knowledge base — "take everything I have into account".
  const { searchEverything, RELATED_MAX_DISTANCE } = await import("@/core/embeddings");
  const hits = (await searchEverything(prompt, 10).catch(() => [])).filter(
    (h) => h.distance <= RELATED_MAX_DISTANCE,
  );

  // 2) Article(s) named in the prompt.
  const urls = extractUrls(prompt);
  const articles = urls.length
    ? (await Promise.all(urls.slice(0, 4).map(readArticle))).filter(
        (a): a is Article => a !== null,
      )
    : [];

  // 3) Related web coverage — only when there's a seed article to expand on.
  const related = articles.length
    ? await webSearchSources(articles[0].title, { max: 4 }).catch(() => [])
    : [];

  if (hits.length === 0 && articles.length === 0)
    return { block: "", articles: 0, related: 0, knowledge: 0 };

  const parts: string[] = [
    "",
    "=== SOURCE MATERIAL (base your analysis on this; you do NOT need web/search/grep tools) ===",
  ];

  if (hits.length) {
    parts.push(
      "",
      "--- FROM YOUR OWN KNOWLEDGE BASE (saved notes, knowledge, vault, tasks, mail, calendar, past answers…) ---",
    );
    for (const h of hits) {
      parts.push(`• [${h.kind}] ${h.title}\n${(h.snippet ?? "").slice(0, 500)}`);
    }
  }

  // Persist fetched articles to disk so a file-oriented executor can also read them.
  const dir = join(workdir, ".aios", "sources");
  await mkdir(dir, { recursive: true }).catch(() => {});
  if (articles.length) {
    parts.push(
      "",
      "--- FETCHED ARTICLE(S) named in the task (also saved under .aios/sources/) ---",
    );
  }
  let i = 0;
  for (const a of articles) {
    i += 1;
    let host = "src";
    try {
      host = new URL(a.url).hostname.replace(/^www\./, "");
    } catch {
      /* keep default */
    }
    const fname = `${String(i).padStart(2, "0")}-${host}.md`;
    await writeFile(
      join(dir, fname),
      `# ${a.title}\nSource: ${a.url}\n\n${a.text}\n`,
      "utf8",
    ).catch(() => {});
    parts.push(
      "",
      `--- ARTICLE ${i}: ${a.title} (${a.url}) ---`,
      a.text.slice(0, MAX_ARTICLE_CHARS),
    );
  }

  if (related.length) {
    parts.push("", "--- RELATED SOURCES (for context, cite where useful) ---");
    for (const r of related) {
      parts.push(`• ${r.title} — ${r.href}\n${(r.snippet ?? "").slice(0, 600)}`);
    }
  }

  parts.push("", "=== END SOURCE MATERIAL ===");
  return {
    block: parts.join("\n"),
    articles: articles.length,
    related: related.length,
    knowledge: hits.length,
  };
}
