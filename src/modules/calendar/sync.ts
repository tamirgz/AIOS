import type { VEvent } from "node-ical";
import { and, eq, gte, notInArray } from "drizzle-orm";
import { db, sql } from "@/core/db/client";
import { getSetting, SETTING_KEYS } from "@/core/app-settings";
import type { ModuleJob } from "@/core/modules/types.server";
import { calendarEvents } from "./schema";

const WINDOW_PAST_DAYS = 30;
const WINDOW_FUTURE_DAYS = 365;

/**
 * Read-only Google Calendar sync via the calendar's private ICS URL
 * (Google Calendar → Settings → "Secret address in iCal format").
 * Runs every 5 minutes in the worker and on demand via NOTIFY calendar_sync.
 */
export async function syncIcs(): Promise<{ synced: number } | null> {
  const url = await getSetting(SETTING_KEYS.calendarIcsUrl);
  if (!url) return null;

  // Lazy import: node-ical (via @js-temporal/polyfill) breaks under the Next
  // bundler at module evaluation; only the worker ever executes this.
  const ical = (await import("node-ical")).default;
  const data = await ical.async.fromURL(url);
  const from = new Date(Date.now() - WINDOW_PAST_DAYS * 86_400_000);
  const to = new Date(Date.now() + WINDOW_FUTURE_DAYS * 86_400_000);

  const seenUids: string[] = [];
  let synced = 0;

  for (const item of Object.values(data)) {
    if (!item || (item as { type?: string }).type !== "VEVENT") continue;
    const ev = item as VEvent;
    const start = ev.start as Date | undefined;
    if (!start || start < from || start > to) continue;
    const uid = String(ev.uid ?? "");
    if (!uid) continue;

    seenUids.push(uid);
    synced++;
    const allDay =
      ev.datetype === "date" ||
      (ev.start as { dateOnly?: boolean })?.dateOnly === true;

    const fields = {
      title: String(ev.summary ?? "(untitled)"),
      notes: ev.description ? String(ev.description).slice(0, 2000) : null,
      location: ev.location ? String(ev.location) : null,
      startAt: start,
      endAt: (ev.end as Date | undefined) ?? null,
      allDay,
    };

    await db
      .insert(calendarEvents)
      .values({ ...fields, source: "ics", icsUid: uid })
      .onConflictDoUpdate({
        target: calendarEvents.icsUid,
        set: { ...fields, updatedAt: new Date() },
      });
  }

  // Remove ICS events (in the future window) that vanished from the feed.
  await db
    .delete(calendarEvents)
    .where(
      and(
        eq(calendarEvents.source, "ics"),
        gte(calendarEvents.startAt, new Date()),
        seenUids.length
          ? notInArray(calendarEvents.icsUid, seenUids)
          : undefined,
      ),
    );

  await sql.notify("calendar_changed", "synced");
  return { synced };
}

export const calendarJobs: ModuleJob[] = [
  {
    channel: "calendar_sync",
    schedule: "*/5 * * * *",
    handle: async () => {
      await syncIcs();
    },
  },
];
