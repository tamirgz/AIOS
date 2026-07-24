import { and, desc, eq, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/core/db/client";
import type { AiToolDef } from "@/core/modules/types.server";
import { gmailMessages } from "./schema";

/**
 * Read-only Gmail for agents — served from the synced mirror (fast, worker-safe,
 * metadata only). Feeds the daily plan and the follow-up tracker: "what came in
 * that I might owe a reply to."
 */
export const gmailTools: AiToolDef[] = [
  {
    name: "gmail.recent",
    description:
      "List recent emails (last 7 days, metadata only: from, subject, snippet, when, unread). Use to spot messages that likely need a reply or feed the day's plan. Does NOT read full bodies.",
    input: z.object({
      unreadOnly: z.boolean().optional(),
      limit: z.number().int().min(1).max(40).optional(),
    }),
    async execute(i: { unreadOnly?: boolean; limit?: number }) {
      const since = new Date(Date.now() - 7 * 86_400_000);
      const rows = await db
        .select({
          from: sql<string>`coalesce(${gmailMessages.fromName}, ${gmailMessages.fromEmail})`,
          email: gmailMessages.fromEmail,
          subject: gmailMessages.subject,
          snippet: gmailMessages.snippet,
          receivedAt: gmailMessages.receivedAt,
          unread: gmailMessages.unread,
        })
        .from(gmailMessages)
        .where(
          i.unreadOnly
            ? and(eq(gmailMessages.unread, true), gte(gmailMessages.receivedAt, since))
            : gte(gmailMessages.receivedAt, since),
        )
        .orderBy(desc(gmailMessages.receivedAt))
        .limit(i.limit ?? 20);
      return rows;
    },
  },
];
