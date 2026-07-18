import type { KnowledgeKind } from "./schema";

const URL_RE = /https?:\/\/[^\s]+/i;

export function detectKind(input: string): {
  kind: KnowledgeKind;
  url: string | null;
} {
  const match = input.match(URL_RE);
  if (match) {
    const url = match[0].replace(/[).,]+$/, "");
    let host = "";
    try {
      host = new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return { kind: "text", url: null };
    }
    if (host === "github.com" && /github\.com\/[^/]+\/[^/]+/.test(url)) {
      return { kind: "github", url };
    }
    if (host.endsWith("instagram.com")) return { kind: "instagram", url };
    if (host.endsWith("tiktok.com")) return { kind: "tiktok", url };
    if (host.endsWith("youtube.com") || host === "youtu.be") {
      return { kind: "youtube", url };
    }
    return { kind: "link", url };
  }
  // Quote heuristics: quotation marks, or an em-dash attribution, short-ish.
  const trimmed = input.trim();
  if (
    /^["“'«]/.test(trimmed) ||
    (/\s[—–-]\s?[A-Z][a-zA-Z. ]+$/.test(trimmed) && trimmed.length < 600)
  ) {
    return { kind: "quote", url: null };
  }
  return { kind: "text", url: null };
}
