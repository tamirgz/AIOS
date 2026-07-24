import { sql as dsql } from "drizzle-orm";
import { db, sql } from "@/core/db/client";
import { getSetting, setSetting } from "@/core/app-settings";
import { accessToken, isGoogleConnected } from "@/modules/calendar/google";
import { gmailMessages } from "./schema";

const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";
/** Setting flag: does the current token actually carry the gmail scope? */
export const GMAIL_AUTHORIZED = "gmail_authorized";

interface GmailMeta {
  id: string;
  threadId?: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: { headers?: { name: string; value: string }[] };
}

/** Split "Display Name <email@host>" into name + email. */
function parseFrom(raw: string | undefined): { name?: string; email?: string } {
  if (!raw) return {};
  const m = raw.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (m) return { name: m[1].replace(/^"|"$/g, "") || undefined, email: m[2].toLowerCase() };
  return { email: raw.trim().toLowerCase() };
}

/**
 * Sync recent Gmail metadata (last 7 days). Returns null when Google isn't
 * connected, or {needsReconsent:true} when the token lacks the gmail scope
 * (the user must re-run Connect Google) — never throws for those cases.
 */
export async function syncGmail(
  log: (m: string) => void = () => {},
): Promise<{ synced: number } | { needsReconsent: true } | null> {
  if (!(await isGoogleConnected())) return null;
  const token = await accessToken();
  const headers = { Authorization: `Bearer ${token}` };

  const listRes = await fetch(
    `${GMAIL}/messages?maxResults=40&q=${encodeURIComponent("newer_than:7d")}`,
    { headers, signal: AbortSignal.timeout(20_000) },
  );
  if (listRes.status === 403) {
    await setSetting(GMAIL_AUTHORIZED, "false");
    log("gmail: token lacks the gmail.readonly scope — reconnect Google");
    return { needsReconsent: true };
  }
  if (!listRes.ok) throw new Error(`gmail messages.list → ${listRes.status}`);
  await setSetting(GMAIL_AUTHORIZED, "true");

  const { messages = [] } = (await listRes.json()) as {
    messages?: { id: string; threadId: string }[];
  };

  let synced = 0;
  for (const { id } of messages) {
    const res = await fetch(
      `${GMAIL}/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
      { headers, signal: AbortSignal.timeout(15_000) },
    );
    if (!res.ok) continue;
    const m = (await res.json()) as GmailMeta;
    const h = Object.fromEntries(
      (m.payload?.headers ?? []).map((x) => [x.name.toLowerCase(), x.value]),
    );
    const from = parseFrom(h.from);
    const receivedAt = m.internalDate ? new Date(Number(m.internalDate)) : null;
    await db
      .insert(gmailMessages)
      .values({
        id: m.id,
        threadId: m.threadId ?? null,
        fromName: from.name ?? null,
        fromEmail: from.email ?? null,
        subject: h.subject ?? null,
        snippet: m.snippet ?? null,
        receivedAt,
        unread: (m.labelIds ?? []).includes("UNREAD"),
        labels: m.labelIds ?? [],
        link: `https://mail.google.com/mail/u/0/#all/${m.id}`,
      })
      .onConflictDoUpdate({
        target: gmailMessages.id,
        set: {
          unread: (m.labelIds ?? []).includes("UNREAD"),
          labels: m.labelIds ?? [],
        },
      });
    synced++;
  }

  // Drop anything older than the window so the table stays a rolling mirror.
  await db.delete(gmailMessages).where(dsql`${gmailMessages.receivedAt} < now() - interval '14 days'`);
  await sql.notify("gmail_changed", "");
  log(`gmail: synced ${synced}`);
  return { synced };
}

/** Whether the connected Google token is authorized for Gmail. */
export async function gmailAuthorized(): Promise<boolean> {
  return (await getSetting(GMAIL_AUTHORIZED)) === "true";
}
