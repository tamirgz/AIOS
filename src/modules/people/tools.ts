import { desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/core/db/client";
import type { AiToolContext, AiToolDef } from "@/core/modules/types.server";
import { registerRefs, resolveRef } from "@/core/ai/refs";
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
    async execute(i: { limit?: number }, ctx: AiToolContext) {
      const rows = await listPeople(db);
      // Short handles (p1, p2…) — a follow-up or note targets the person by ref,
      // never a uuid, so it can't be written to the wrong person.
      return registerRefs(
        ctx,
        "person",
        "p",
        rows.slice(0, i.limit ?? 40).map((p) => ({
          id: p.id,
          name: p.name ?? p.email,
          email: p.email,
          meetings: p.meetingCount,
          daysSinceLastMet: daysAgo(p.lastSeenAt),
          openFollowups: p.openFollowups,
        })),
      );
    },
  },
  {
    name: "people.recentMeetings",
    description:
      "List meetings that already happened in the last N days (default 3), with attendees and the meeting's actual notes/agenda. A follow-up MUST be grounded in `notes`: when `hasNotes` is false the meeting has no agenda at all (its title is often just participant names), so there is nothing real to follow up on — SKIP it and never invent a topic.",
    input: z.object({ days: z.number().int().min(1).max(30).optional() }),
    async execute(i: { days?: number }) {
      const rows = await recentMeetings(i.days ?? 3, db);
      return rows.map((m) => {
        const attendees = (m.attendees ?? [])
          .filter((a) => !a.self)
          .map((a) => ({ name: a.name ?? a.email, email: a.email }));
        const notes = (m.notes ?? "").trim();
        return { title: m.title, at: m.startAt, notes: notes || null, hasNotes: notes.length > 0, attendees };
      });
    },
  },
  {
    name: "followup.raise",
    description:
      "Raise a follow-up as a card in the 'Needs you' queue, anchored to a person. Use type 'do' for a concrete step you should take, 'approve' only when a real side-effect (e.g. sending a message) needs sign-off, 'notify' for an FYI. Deduplication is automatic — at most one open card per (person + title), so re-running never duplicates; you don't need to manage a key.",
    input: z.object({
      ref: z.string().describe("Person ref from people.list, e.g. 'p2' — never a raw id"),
      type: z.enum(ATTENTION_TYPES).default("do"),
      title: z.string().min(3),
      body: z.string().optional(),
      urgency: z.number().int().min(0).max(100).optional(),
      dedupeKey: z.string().optional(),
    }),
    async execute(
      i: {
        ref: string;
        type: (typeof ATTENTION_TYPES)[number];
        title: string;
        body?: string;
        urgency?: number;
        dedupeKey?: string;
      },
      ctx: AiToolContext,
    ) {
      const p = resolveRef(ctx, "person", i.ref);
      if ("error" in p) return p;
      const row = await insertAttentionItem({
        type: i.type,
        title: i.title,
        body: i.body,
        personRef: `people:${p.id}`,
        href: `/m/people/${p.id}`,
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
      "Record a short durable note about a person (context, what they care about, open threads). Overwrites the existing note. Identify the person by their `ref` from people.list (e.g. 'p2') — never a raw id.",
    input: z.object({
      ref: z.string().describe("Person ref from people.list, e.g. 'p2'"),
      notes: z.string().max(1000),
    }),
    async execute(i: { ref: string; notes: string }, ctx: AiToolContext) {
      const p = resolveRef(ctx, "person", i.ref);
      if ("error" in p) return p;
      await db
        .update(people)
        .set({ notes: i.notes.trim() || null, updatedAt: new Date() })
        .where(eq(people.id, p.id));
      return { updated: true };
    },
  },
];
