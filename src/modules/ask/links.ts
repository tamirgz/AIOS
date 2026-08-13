/**
 * Link-quality policy for Ask, shared by the answer verifier and the web-search
 * enricher so the two never drift. Enrichment links must clear a professional
 * bar: reachable AND free-to-read AND a primary/authoritative source — not a
 * paywall and not a tertiary/crowd/SEO page.
 */

/** Domains that return 200 but wall their content behind a login/subscription. */
export const GATED_DOMAIN =
  /(^|\.)(gartner|forrester|idc|statista|wsj|ft|bloomberg|nytimes|economist|hbr|nature|sciencedirect|springer|ieee|academia)\.(com|org|net|edu)$/i;

/**
 * Crowd-sourced, blog, forum and SEO domains — reachable, but not the
 * primary/authoritative sources a professional answer should cite. Demoted just
 * like paywalls: Wikipedia et al. are tertiary references. Enrichment should
 * point at standards bodies, official docs and government/vendor primary sources.
 */
export const LOW_AUTHORITY_DOMAIN =
  /(^|\.)(wikipedia|wikimedia|wiktionary|medium|substack|blogspot|wordpress|quora|reddit|stackoverflow|stackexchange|geeksforgeeks|w3schools|tutorialspoint|javatpoint|baeldung|dev\.to|hackernoon|freecodecamp|simplilearn|guru99|educative|programiz|towardsdatascience|merriam-webster|thesaurus|collinsdictionary|vocabulary|thefreedictionary|yourdictionary|wordnik|urbandictionary|dictionary)\.(com|org|net|io)$/i;

/** Dictionary/reference hosts on any subdomain (e.g. dictionary.cambridge.org). */
const REFERENCE_HOST = /(^|\.)(dictionary|thesaurus)\./i;

/**
 * Cheap, no-network verdict: is this URL unfit to cite as enrichment? True for
 * a bad protocol, a paywalled domain, or a tertiary/crowd source. Used to
 * pre-filter search results before spending a fetch on them.
 */
export function isLowQualityUrl(url: string): boolean {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return true;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return true;
  return (
    GATED_DOMAIN.test(u.hostname) ||
    LOW_AUTHORITY_DOMAIN.test(u.hostname) ||
    REFERENCE_HOST.test(u.hostname)
  );
}

const VERIFY_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/** A publicly-reachable, free-to-read, authoritative page? Fails closed on any doubt. */
export async function linkAccessible(url: string): Promise<boolean> {
  if (isLowQualityUrl(url)) return false;
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(6000),
      headers: { "User-Agent": VERIFY_UA },
    });
    if (!res.ok) return false; // 4xx/5xx, incl. 401/403 gates
    // Redirected to a login/subscribe/consent page ⇒ not really accessible.
    const finalPath = new URL(res.url).pathname;
    if (/\/(login|sign[_-]?in|subscribe|register|account|paywall|consent)\b/i.test(finalPath))
      return false;
    return true;
  } catch {
    return false; // timeout, DNS, TLS, network — treat as inaccessible
  }
}

/**
 * Verify every external markdown link in the answer and demote the unreachable,
 * gated, or low-authority ones to plain text (keeping the label). Runs the
 * checks concurrently over the distinct URLs so it adds a fixed ~few seconds,
 * not per-link. The `[n]` citations (no `(url)`) are untouched.
 */
export async function verifyExternalLinks(answer: string): Promise<string> {
  const linkRe = /\[([^\]]+)\]\(((?:https?:)?\/\/[^)\s]+)\)/gi;
  const urls = [...new Set([...answer.matchAll(linkRe)].map((m) => m[2]))];
  if (urls.length === 0) return answer;
  const ok = new Map<string, boolean>();
  await Promise.all(urls.map(async (u) => ok.set(u, await linkAccessible(u))));
  return answer.replace(linkRe, (whole, label, url) => (ok.get(url) ? whole : label));
}
