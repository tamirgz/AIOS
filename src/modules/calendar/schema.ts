import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const EVENT_SOURCES = ["local", "ics"] as const;

export const calendarEvents = pgTable(
  "calendar_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: text("title").notNull(),
    notes: text("notes"),
    location: text("location"),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }),
    allDay: boolean("all_day").notNull().default(false),
    source: text("source", { enum: EVENT_SOURCES }).notNull().default("local"),
    /** Stable UID from the ICS feed — sync upserts on this. */
    icsUid: text("ics_uid"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("calendar_events_start").on(t.startAt),
    uniqueIndex("calendar_events_ics_uid").on(t.icsUid),
  ],
);

export type CalendarEvent = typeof calendarEvents.$inferSelect;
