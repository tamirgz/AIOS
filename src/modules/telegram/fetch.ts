/**
 * Read a public Telegram channel through its `t.me/s/<name>` web preview. No
 * bot, no API key, no login — just the same HTML a browser sees. Pagination is
 * `?before=<id>`, which walks backwards in time; that's how the 2-week backfill
 * reaches past the ~20 posts the first page shows.
 */
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36";

export interface RawPost {
  postId: number;
  postedAt: Date | null;
  text: string;
  urls: string[];
}

function stripTags(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#?rlm;|&#?lrm;|&#8207;|&#8206;/gi, "") // RTL/LTR mark entities
    .replace(/‏|‎/g, "") // RTL/LTR marks (literal)
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Parse one t.me/s/ page into posts (newest last, as the page orders them). */
export function parsePosts(html: string): RawPost[] {
  const chunks = html.split(/<div class="tgme_widget_message_wrap/).slice(1);
  const posts: RawPost[] = [];
  for (const c of chunks) {
    const idM = c.match(/data-post="[^"/]+\/(\d+)"/);
    if (!idM) continue;
    const postId = Number(idM[1]);
    const dtM = c.match(/datetime="([^"]+)"/);
    const postedAt = dtM ? new Date(dtM[1]) : null;
    const textM = c.match(
      /js-message_text[^>]*>([\s\S]*?)<\/div>\s*<div class="tgme_widget_message_footer/,
    );
    const textHtml = textM?.[1] ?? "";
    const urls = [...textHtml.matchAll(/href="(https?:\/\/[^"]+)"/g)]
      .map((m) => m[1])
      .filter((u) => !/t\.me|telegram\.org/.test(u));
    posts.push({ postId, postedAt, text: stripTags(textHtml), urls });
  }
  return posts;
}

async function getPage(username: string, beforeId?: number): Promise<string> {
  const url =
    `https://t.me/s/${encodeURIComponent(username)}` +
    (beforeId ? `?before=${beforeId}` : "");
  const res = await fetch(url, {
    headers: { "User-Agent": UA },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`t.me/s/${username} → HTTP ${res.status}`);
  return res.text();
}

/**
 * Fetch posts newer than `sinceId` (the ledger) OR, on a first run, back to
 * `sinceDate`. Paginates with `?before=` until it crosses the boundary or runs
 * out. Bounded so a misconfig can't spider forever.
 */
export async function fetchChannelPosts(
  username: string,
  opts: { sinceId?: number | null; sinceDate?: Date | null },
): Promise<RawPost[]> {
  const out: RawPost[] = [];
  const seen = new Set<number>();
  let before: number | undefined;
  for (let page = 0; page < 40; page++) {
    const html = await getPage(username, before);
    const batch = parsePosts(html).filter((p) => !seen.has(p.postId));
    if (!batch.length) break;
    for (const p of batch) seen.add(p.postId);
    out.push(...batch);

    const oldest = Math.min(...batch.map((p) => p.postId));
    // Stop once we've reached posts we've already ingested…
    if (opts.sinceId && oldest <= opts.sinceId) break;
    // …or posts older than the backfill window.
    if (opts.sinceDate) {
      const oldestDate = batch
        .map((p) => p.postedAt)
        .filter(Boolean)
        .sort((a, b) => +a! - +b!)[0];
      if (oldestDate && oldestDate < opts.sinceDate) break;
    }
    before = oldest;
  }

  return out
    .filter((p) => (opts.sinceId ? p.postId > opts.sinceId : true))
    .filter((p) =>
      opts.sinceDate && p.postedAt ? p.postedAt >= opts.sinceDate : true,
    )
    .sort((a, b) => a.postId - b.postId);
}

/**
 * Follow a post's link (usually an ift.tt shortener → the real article) and
 * pull readable text. Best-effort: a dead link just yields "".
 */
export async function fetchUrlText(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return "";
    let html = await res.text();
    // Drop non-content so it can neither pollute nor shadow the real article.
    html = html.replace(/<(script|style|noscript|template|svg)[\s\S]*?<\/\1>/gi, " ");

    // Pages routinely carry several <article>/<main> blocks — promo cards,
    // "related", newsletter widgets — and the real body is the LONGEST one, not
    // the first. (Observed: The Hacker News has 5 <article>s; grabbing the first
    // returned only a "11 Real Stories…" promo.) So pick the longest match.
    const longest = (re: RegExp): string | undefined =>
      [...html.matchAll(re)]
        .map((m) => m[0])
        .sort((a, b) => b.length - a.length)[0];
    const container =
      longest(/<article[\s\S]*?<\/article>/gi) ??
      longest(/<main[\s\S]*?<\/main>/gi) ??
      html;

    const paras = (src: string) =>
      [...src.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
        .map((m) => stripTags(m[1]))
        .filter((t) => t.length > 40)
        .join("\n\n");

    let text = (paras(container) || stripTags(container)).slice(0, 4000);
    // If the chosen container was thin (a mis-pick or a JS-rendered page), fall
    // back to every paragraph on the page and keep whichever is richer.
    if (text.length < 300) {
      const all = paras(html).slice(0, 4000);
      if (all.length > text.length) text = all;
    }
    return text;
  } catch {
    return "";
  }
}
