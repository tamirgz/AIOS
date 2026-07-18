import type { KnowledgeKind } from "./schema";

const FETCH_TIMEOUT = 12_000;

async function get(url: string, headers: Record<string, string> = {}) {
  return fetch(url, {
    headers: { "User-Agent": "AIOS-knowledge/0.1", ...headers },
    signal: AbortSignal.timeout(FETCH_TIMEOUT),
    redirect: "follow",
  });
}

async function fetchGithub(url: string) {
  const m = url.match(/github\.com\/([^/]+)\/([^/?#]+)/);
  if (!m) throw new Error("cannot parse owner/repo from URL");
  const [, owner, repo] = m;
  const repoRes = await get(
    `https://api.github.com/repos/${owner}/${repo.replace(/\.git$/, "")}`,
    { Accept: "application/vnd.github+json" },
  );
  if (!repoRes.ok) throw new Error(`GitHub API → ${repoRes.status}`);
  const meta = (await repoRes.json()) as Record<string, unknown>;

  let readme = "";
  const readmeRes = await get(
    `https://api.github.com/repos/${owner}/${repo}/readme`,
    { Accept: "application/vnd.github.raw+json" },
  );
  if (readmeRes.ok) readme = (await readmeRes.text()).slice(0, 9000);

  return {
    source: "github-api",
    title: `${owner}/${meta.name ?? repo}`,
    description: meta.description ?? null,
    stars: meta.stargazers_count ?? null,
    language: meta.language ?? null,
    topics: meta.topics ?? [],
    homepage: meta.homepage ?? null,
    readme,
  };
}

async function fetchOEmbed(url: string, endpoint: string) {
  const res = await get(`${endpoint}${encodeURIComponent(url)}`);
  if (!res.ok) throw new Error(`oEmbed → ${res.status}`);
  const data = (await res.json()) as Record<string, unknown>;
  return {
    source: "oembed",
    title: data.title ?? null,
    author: data.author_name ?? null,
    thumbnail: data.thumbnail_url ?? null,
    html: typeof data.html === "string" ? data.html.slice(0, 2000) : null,
  };
}

async function fetchPage(url: string) {
  const res = await get(url);
  if (!res.ok) throw new Error(`page fetch → ${res.status}`);
  const html = (await res.text()).slice(0, 400_000);
  const pick = (re: RegExp) => html.match(re)?.[1]?.trim() ?? null;
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z#0-9]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 6000);
  return {
    source: "page",
    title:
      pick(/<meta property="og:title" content="([^"]*)"/i) ??
      pick(/<title[^>]*>([^<]*)<\/title>/i),
    description:
      pick(/<meta property="og:description" content="([^"]*)"/i) ??
      pick(/<meta name="description" content="([^"]*)"/i),
    text,
  };
}

/**
 * Fetch public source material per kind. Instagram has no tokenless oEmbed —
 * we fall back to a plain page fetch (usually just og tags) and lean on the
 * user's note; that limitation is by platform design.
 */
export async function fetchRaw(
  kind: KnowledgeKind,
  url: string | null,
): Promise<Record<string, unknown> | null> {
  if (!url) return null;
  switch (kind) {
    case "github":
      return fetchGithub(url);
    case "tiktok":
      return fetchOEmbed(url, "https://www.tiktok.com/oembed?url=");
    case "youtube":
      return fetchOEmbed(url, "https://www.youtube.com/oembed?format=json&url=");
    case "instagram":
    case "link":
      return fetchPage(url);
    default:
      return null;
  }
}
