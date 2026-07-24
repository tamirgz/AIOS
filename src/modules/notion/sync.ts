import { sql as dsql } from "drizzle-orm";
import { db, sql } from "@/core/db/client";
import { getSetting } from "@/core/app-settings";
import { notionPages } from "./schema";

const NOTION = "https://api.notion.com/v1";
const VERSION = "2022-06-28";
export const NOTION_TOKEN_KEY = "notion_token";

async function token(): Promise<string | null> {
  return (await getSetting(NOTION_TOKEN_KEY)) || null;
}

export async function notionConnected(): Promise<boolean> {
  return !!(await token());
}

interface NotionPageObj {
  id: string;
  url?: string;
  last_edited_time?: string;
  properties?: Record<string, { type: string; title?: { plain_text: string }[] }>;
}

function extractTitle(p: NotionPageObj): string {
  for (const prop of Object.values(p.properties ?? {})) {
    if (prop.type === "title" && prop.title?.length) {
      return prop.title.map((t) => t.plain_text).join("").trim() || "(untitled)";
    }
  }
  return "(untitled)";
}

/** Concatenate a page's block text (first ~50 blocks), capped. */
async function pageText(id: string, headers: HeadersInit): Promise<string> {
  const res = await fetch(`${NOTION}/blocks/${id}/children?page_size=50`, {
    headers,
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) return "";
  const { results = [] } = (await res.json()) as { results?: Record<string, unknown>[] };
  const parts: string[] = [];
  for (const b of results) {
    const type = b.type as string | undefined;
    if (!type) continue;
    const block = b[type] as { rich_text?: { plain_text: string }[] } | undefined;
    if (Array.isArray(block?.rich_text)) {
      parts.push(block.rich_text.map((r) => r.plain_text).join(""));
    }
  }
  return parts.join("\n").slice(0, 4000);
}

/**
 * Sync Notion pages (title + text snippet). Returns null-ish signals instead of
 * throwing for the "not set up" cases so the UI can prompt. Content changes null
 * the embedding so the sweep re-embeds → Ask/search pick it up.
 */
export async function syncNotion(
  log: (m: string) => void = () => {},
): Promise<{ synced: number } | { needsToken: true } | { badToken: true }> {
  const tok = await token();
  if (!tok) return { needsToken: true };
  const headers = {
    Authorization: `Bearer ${tok}`,
    "Notion-Version": VERSION,
    "Content-Type": "application/json",
  };

  const searchRes = await fetch(`${NOTION}/search`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      filter: { value: "page", property: "object" },
      page_size: 50,
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (searchRes.status === 401) {
    log("notion: invalid token");
    return { badToken: true };
  }
  if (!searchRes.ok) throw new Error(`notion search → ${searchRes.status}`);
  const { results = [] } = (await searchRes.json()) as { results?: NotionPageObj[] };

  let synced = 0;
  for (const p of results) {
    const title = extractTitle(p);
    const content = await pageText(p.id, headers);
    const lastEdited = p.last_edited_time ? new Date(p.last_edited_time) : null;
    await db
      .insert(notionPages)
      .values({
        id: p.id,
        title,
        url: p.url ?? null,
        content,
        lastEdited,
        embedding: null,
      })
      .onConflictDoUpdate({
        target: notionPages.id,
        set: { title, url: p.url ?? null, content, lastEdited, embedding: null },
        // Only touch (and re-embed) pages that actually changed.
        setWhere: dsql`${notionPages.lastEdited} is distinct from ${lastEdited}`,
      });
    synced++;
  }
  await sql.notify("notion_changed", "");
  log(`notion: synced ${synced}`);
  return { synced };
}
