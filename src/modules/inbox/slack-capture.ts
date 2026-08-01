/**
 * Slack capture channel → Inbox. Any new top-level message in a configured
 * capture channel (e.g. #ai-os) is dropped into the inbox, where the existing
 * triage pipeline files it as a task / note / idea / knowledge / event. This
 * is distinct from the report intake (agents/slack-intake.ts), which feeds the
 * Agents page — capture is for things YOU want turned into work.
 *
 * Polling (not the Events API) because AIOS runs locally with no public
 * endpoint: outbound conversations.history needs no inbound webhook. Idempotent
 * via a per-channel cursor plus a per-message `source` dedupe in the inbox.
 */
import { getSetting, setSetting } from "@/core/app-settings";
import type { ModuleJob } from "@/core/modules/types.server";
import { SLACK_KEYS, slackApi, slackToMarkdown } from "@/modules/agents/slack-intake";
import { captureInboxItem } from "./core";

export const SLACK_INBOX_KEY = "slack_inbox_channels";

const MAX_INPUT = 8_000;

interface SlackMessage {
  type: string;
  subtype?: string;
  text?: string;
  ts: string;
  thread_ts?: string;
}

export async function scanSlackInbox(
  log: (m: string) => void = () => {},
): Promise<number> {
  const token = (await getSetting(SLACK_KEYS.token))?.trim();
  const channelList = (await getSetting(SLACK_INBOX_KEY))?.trim();
  if (!token || !channelList) return 0;

  const channels = channelList
    .split(/[\s,]+/)
    .map((c) => c.trim().replace(/^#/, ""))
    .filter(Boolean);

  let captured = 0;
  const { emojify } = await import("node-emoji");

  for (const channel of channels) {
    try {
      const cursorKey = `slack_inbox_last_ts:${channel}`;
      const lastTs = await getSetting(cursorKey);
      const history = await slackApi<{ messages: SlackMessage[] }>(
        token,
        "conversations.history",
        { channel, limit: "20", ...(lastTs ? { oldest: lastTs } : {}) },
      );

      const messages = (history.messages ?? [])
        // Top-level human posts only — no joins/leaves, no thread replies.
        .filter((m) => m.type === "message" && !m.subtype && !m.thread_ts)
        .filter((m) => (m.text ?? "").trim().length > 0)
        .sort((a, b) => Number(a.ts) - Number(b.ts));

      for (const m of messages) {
        if (lastTs && Number(m.ts) <= Number(lastTs)) continue;
        const md = slackToMarkdown(m.text ?? "", emojify).trim().slice(0, MAX_INPUT);
        if (!md) continue;
        const row = await captureInboxItem({
          input: md,
          source: `slack:${channel}:${m.ts}`,
        });
        if (row) captured++;
      }

      const newest = messages.at(-1)?.ts;
      if (newest) await setSetting(cursorKey, newest);
    } catch (e) {
      log(`slack inbox ${channel} failed: ${String(e).slice(0, 160)}`);
    }
  }

  if (captured > 0) log(`slack inbox: captured ${captured} message(s)`);
  return captured;
}

export const slackInboxJobs: ModuleJob[] = [
  {
    channel: "slack_inbox",
    schedule: "*/5 * * * *",
    handle: async () => {
      await scanSlackInbox(console.log);
    },
  },
];
