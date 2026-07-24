import { and, desc, eq, gte, sql } from "drizzle-orm";
import { db as defaultDb, type Db } from "@/core/db/client";
import { calendarEvents } from "../calendar/schema";
import { attentionItems } from "../today/schema";
import { people, type Person } from "./schema";

export interface PersonWithFollowups extends Person {
  openFollowups: number;
}

/** People, most-recently-seen first, with their open follow-up count. */
export async function listPeople(db: Db = defaultDb): Promise<PersonWithFollowups[]> {
  const ref = sql`'people:' || ${people.id}`;
  const rows = await db
    .select({
      person: people,
      openFollowups: sql<number>`(select count(*) from ${attentionItems} where ${attentionItems.personRef} = ${ref} and ${attentionItems.status} = 'open')`,
    })
    .from(people)
    .orderBy(sql`${people.lastSeenAt} desc nulls last`)
    .limit(200);
  return rows.map((r) => ({ ...r.person, openFollowups: Number(r.openFollowups) }));
}

export async function getPerson(id: string, db: Db = defaultDb) {
  const [row] = await db.select().from(people).where(eq(people.id, id)).limit(1);
  return row ?? null;
}

/** Meetings this person attended (most recent first), by email match in the jsonb. */
export async function getPersonMeetings(email: string, limit = 20, db: Db = defaultDb) {
  return db
    .select()
    .from(calendarEvents)
    .where(sql`${calendarEvents.attendees} @> ${JSON.stringify([{ email: email.toLowerCase() }])}::jsonb`)
    .orderBy(desc(calendarEvents.startAt))
    .limit(limit);
}

/** Open follow-ups anchored to a person (for the detail view). */
export async function listFollowupsForPerson(personId: string, db: Db = defaultDb) {
  return db
    .select()
    .from(attentionItems)
    .where(
      and(
        eq(attentionItems.personRef, `people:${personId}`),
        eq(attentionItems.status, "open"),
      ),
    )
    .orderBy(desc(attentionItems.urgency));
}

/**
 * Recent past meetings (last `days`), newest first — the follow-up tracker
 * reasons over these to decide who needs a follow-up.
 */
export async function recentMeetings(days = 3, db: Db = defaultDb) {
  const since = new Date(Date.now() - days * 86_400_000);
  return db
    .select({
      id: calendarEvents.id,
      title: calendarEvents.title,
      startAt: calendarEvents.startAt,
      attendees: calendarEvents.attendees,
    })
    .from(calendarEvents)
    .where(
      and(
        gte(calendarEvents.startAt, since),
        sql`${calendarEvents.startAt} < now()`,
        sql`${calendarEvents.attendees} is not null`,
      ),
    )
    .orderBy(desc(calendarEvents.startAt))
    .limit(50);
}
