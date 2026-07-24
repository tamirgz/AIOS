import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * L3 people: a light CRM derived from calendar attendees — no manual entry.
 * The `people_sync` job upserts one row per distinct attendee email, tracking
 * how often and how recently you meet. Identity is the email.
 */
export const people = pgTable(
  "people",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull(),
    name: text("name"),
    /** Meetings seen in the synced window. */
    meetingCount: integer("meeting_count").notNull().default(0),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    /** Title of the most recent meeting with them — context at a glance. */
    lastEventTitle: text("last_event_title"),
    /** Free-text the user (or an agent) keeps about them. */
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("people_email").on(t.email),
    index("people_last_seen").on(t.lastSeenAt),
  ],
);

export type Person = typeof people.$inferSelect;

/** The entity ref stored in attention_items.personRef for a given person. */
export function personRefOf(id: string) {
  return `people:${id}`;
}
