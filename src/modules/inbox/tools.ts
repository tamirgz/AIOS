import { z } from "zod";
import { getSetting } from "@/core/app-settings";
import type { AiToolDef } from "@/core/modules/types.server";
import { SLACK_KEYS, slackPost } from "@/modules/agents/slack-intake";

/**
 * Outward actions — the first things an agent can DO in the world rather than
 * just record. Marked `risk: "approval"` so the executor parks the call in the
 * approval queue: an agent DRAFTS, the user APPROVES, then it SENDS. Nothing
 * leaves AIOS without a human yes (A2 · Trust).
 */
export const inboxTools: AiToolDef[] = [
  {
    name: "slack.post",
    description:
      "Post a message to a Slack channel on the user's behalf — a project update, a nudge, a drafted reply. This is an outward action: it is queued for the user's approval and only sends once approved.",
    input: z.object({
      channel: z
        .string()
        .min(1)
        .describe("Slack channel id, e.g. C0ABCDEFG (not the #name)"),
      text: z.string().min(1).max(3000).describe("The message to post"),
    }),
    risk: "approval",
    async execute(input) {
      const token = (await getSetting(SLACK_KEYS.token))?.trim();
      if (!token) return { error: "Slack bot token is not set in Settings" };
      const res = await slackPost<{ ok: boolean; error?: string; ts?: string }>(
        token,
        "chat.postMessage",
        { channel: input.channel, text: input.text },
      );
      return res.ok
        ? { posted: true, channel: input.channel, ts: res.ts }
        : { error: res.error ?? "slack post failed" };
    },
  },
];
