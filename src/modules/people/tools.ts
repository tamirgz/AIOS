import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/core/db/client";
import type { AiToolDef } from "@/core/modules/types.server";
import { insertAttentionItem } from "@/modules/today/core";
import { ATTENTION_TYPES } from "@/modules/today/schema";
import { listPeople, recentMeetings } from "./queries";
import { people } from "./schema";

const DAY = 86_400_000;
const daysAgo = (d: Date | null) =>
  d === null ? null : Math.floor((Date.now() - d.getTime()) / DAY);

export const peopleTools: AiToolDef[] = [
  {
    name: "people.list",
    description:
      "List the people you meet with (derived from calendar attendees): name, email, how many meetings, days since you last met, and open follow-up count. Read this to know who's active.",
    input: z.object({ limit: z.number().int().min(1).max(100).optional() }),
    async execute(i: { limit?: number }) {
      const rows = await listPeople(db);
      return rows.slice(0, i.limit ?? 40).map((p) => ({
        id: p.id,
        name: p.name ?? p.email,
        email: p.email,
        meetings: p.meetingCount,
        daysSinceLastMet: daysAgo(p.lastSeenAt),
        openFollowups: p.openFollowups,
      }));
    },
  },
  {
    name: "people.recentMeetings",
    description:
      "List meetings that already happened in the last N days (default 3), with their attendees — the basis for deciding who needs a follow-up.",
    input: z.object({ days: z.number().int().min(1).max(30).optional() }),
    async execute(i: { days?: number }) {
      const rows = await recentMeetings(i.days ?? 3, db);
      return rows.map((m) => ({
        title: m.title,
        at: m.startAt,
        attendees: (m.attendees ?? [])
          .filter((a) => !a.self)
          .map((a) => ({ name: a.name ?? a.email, email: a.email })),
      }));
    },
  },
  {
    name: "followup.raise",
    description:
      "Raise a follow-up as a card in the 'Needs you' queue, anchored to a person. Use type 'do' for a concrete step you should take, 'approve' only when a real side-effect (e.g. sending a message) needs sign-off, 'notify' for an FYI. Give a stable dedupeKey like 'followup:<email>:<YYYY-MM-DD>' so re-running doesn't duplicate.",
    input: z.object({
      personId: z.string().uuid(),
      type: z.enum(ATTENTION_TYPES).default("do"),
      title: z.string().min(3),
      body: z.string().optional(),
      urgency: z.number().int().min(0).max(100).optional(),
      dedupeKey: z.string().optional(),
    }),
    async execute(i: {
      personId: string;
      type: (typeof ATTENTION_TYPES)[number];
      title: string;
      body?: string;
      urgency?: number;
      dedupeKey?: string;
    }) {
      const row = await insertAttentionItem({
        type: i.type,
        title: i.title,
        body: i.body,
        personRef: `people:${i.personId}`,
        href: `/m/people/${i.personId}`,
        urgency: i.urgency ?? 15,
        dedupeKey: i.dedupeKey,
        source: "agent",
      });
      return { id: row.id, raised: true };
    },
  },
  {
    name: "people.setNotes",
    description:
      "Record a short durable note about a person (context, what they care about, open threads). Overwrites the existing note.",
    input: z.object({ personId: z.string().uuid(), notes: z.string().max(1000) }),
    async execute(i: { personId: string; notes: string }) {
      await db
        .update(people)
        .set({ notes: i.notes.trim() || null, updatedAt: new Date() })
        .where(eq(people.id, i.personId));
      return { updated: true };
    },
  },
];
