import { sql as dsql } from "drizzle-orm";
import { db, sql } from "@/core/db/client";
import { getSetting, setSetting } from "@/core/app-settings";
import type { ModuleJob } from "@/core/modules/types.server";
import { externalReports } from "./schema";

export const SLACK_KEYS = {
  token: "slack_bot_token",
  channels: "slack_report_channels",
} as const;

const MAX_BODY = 30_000;

interface SlackMessage {
  type: string;
  subtype?: string;
  text?: string;
  ts: string;
  thread_ts?: string;
  bot_id?: string;
}

async function slackApi<T>(
  token: string,
  method: string,
  params: Record<string, string>,
): Promise<T> {
  const res = await fetch(
    `https://slack.com/api/${method}?${new URLSearchParams(params)}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    },
  );
  const data = (await res.json()) as { ok: boolean; error?: string } & T;
  if (!data.ok) throw new Error(`slack ${method}: ${data.error}`);
  return data;
}

/** Slack markup → readable text (emoji codes, links, bold/italic markers). */
function toPlain(text: string): string {
  return text
    .replace(/<(https?:\/\/[^|>]+)\|([^>]+)>/g, "$2 ($1)")
    .replace(/<(https?:\/\/[^>]+)>/g, "$1")
    .replace(/<mailto:[^|>]+\|([^>]+)>/g, "$1")
    .replace(/:[a-z0-9_+-]+:/g, "")
    .replace(/[*_]{1,2}([^*_]+)[*_]{1,2}/g, "$1")
    .replace(/[ \t]+\n/g, "\n")
    .trim();
}

function titleOf(plain: string, fallback: string): string {
  const first = plain
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  return (first ?? fallback).slice(0, 150);
}

/**
 * Poll the configured Slack channels for new messages and ingest them as
 * external reports. This is how AIOS sees Claude Desktop scheduled routines:
 * they post to Slack, and Slack is readable regardless of where they ran.
 */
export async function scanSlackReports(
  log: (m: string) => void = () => {},
): Promise<number> {
  const token = (await getSetting(SLACK_KEYS.token))?.trim();
  const channelList = (await getSetting(SLACK_KEYS.channels))?.trim();
  if (!token || !channelList) return 0;

  const channels = channelList
    .split(/[\s,]+/)
    .map((c) => c.trim().replace(/^#/, ""))
    .filter(Boolean);

  let fresh = 0;
  for (const channel of channels) {
    try {
      // Resolve a display name once per channel (best-effort).
      const nameKey = `slack_channel_name:${channel}`;
      let name = await getSetting(nameKey);
      if (!name) {
        try {
          const info = await slackApi<{ channel: { name: string } }>(
            token,
            "conversations.info",
            { channel },
          );
          name = `#${info.channel.name}`;
          await setSetting(nameKey, name);
        } catch {
          name = channel;
        }
      }

      const cursorKey = `slack_last_ts:${channel}`;
      const lastTs = await getSetting(cursorKey);
      const history = await slackApi<{ messages: SlackMessage[] }>(
        token,
        "conversations.history",
        {
          channel,
          limit: "20",
          ...(lastTs ? { oldest: lastTs } : {}),
        },
      );

      const messages = (history.messages ?? [])
        // Skip joins/leaves and thread replies — only top-level posts.
        .filter((m) => m.type === "message" && !m.subtype && !m.thread_ts)
        .filter((m) => (m.text ?? "").trim().length > 0)
        .sort((a, b) => Number(a.ts) - Number(b.ts));

      for (const m of messages) {
        if (lastTs && Number(m.ts) <= Number(lastTs)) continue;
        const plain = toPlain(m.text ?? "").slice(0, MAX_BODY);
        const [row] = await db
          .insert(externalReports)
          .values({
            source: `slack:${channel}:${m.ts}`,
            kind: "slack",
            origin: name,
            title: titleOf(plain, `${name} report`),
            body: plain,
            reportedAt: new Date(Number(m.ts) * 1000),
          })
          .onConflictDoNothing()
          .returning({ id: externalReports.id });
        if (row) {
          fresh++;
          const { notify } = await import("@/core/notify");
          await notify({
            title: `${name}: ${titleOf(plain, "report").slice(0, 80)}`,
            body: plain.slice(0, 300),
            level: "info",
            source: `slack:${name}`,
            href: "/m/agents",
          });
        }
      }

      const newest = messages.at(-1)?.ts;
      if (newest) await setSetting(cursorKey, newest);
    } catch (e) {
      log(`slack intake ${channel} failed: ${String(e).slice(0, 160)}`);
    }
  }

  if (fresh > 0) {
    await sql.notify("external_reports", String(fresh));
    log(`slack intake: ${fresh} new report(s)`);
  }
  return fresh;
}

/** Backfill recent history for a channel that was just configured. */
export async function backfillSlack(): Promise<void> {
  const channelList = (await getSetting(SLACK_KEYS.channels))?.trim();
  if (!channelList) return;
  for (const c of channelList.split(/[\s,]+/).filter(Boolean)) {
    await db.execute(
      dsql`delete from app_settings where key = ${`slack_last_ts:${c.replace(/^#/, "")}`}`,
    );
  }
}

export const slackIntakeJobs: ModuleJob[] = [
  {
    channel: "slack_intake",
    schedule: "*/5 * * * *",
    handle: async () => {
      await scanSlackReports(console.log);
    },
  },
];
