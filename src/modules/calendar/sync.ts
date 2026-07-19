import type { VEvent } from "node-ical";
import { and, eq, gte, notInArray } from "drizzle-orm";
import { db, sql } from "@/core/db/client";
import { getSetting, SETTING_KEYS } from "@/core/app-settings";
import type { ModuleJob } from "@/core/modules/types.server";
import { calendarEvents } from "./schema";

const WINDOW_PAST_DAYS = 30;
const WINDOW_FUTURE_DAYS = 365;
/** Recurring events expand into instances — keep the horizon shorter so a
 *  daily rule doesn't flood the table. */
const WINDOW_RECURRING_DAYS = 90;

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

  const isAllDay = (ev: VEvent) =>
    ev.datetype === "date" ||
    (ev.start as { dateOnly?: boolean })?.dateOnly === true;

  const upsert = async (
    uid: string,
    ev: VEvent,
    startAt: Date,
    endAt: Date | null,
  ) => {
    seenUids.push(uid);
    synced++;
    const fields = {
      title: String(ev.summary ?? "(untitled)"),
      notes: ev.description ? String(ev.description).slice(0, 2000) : null,
      location: ev.location ? String(ev.location) : null,
      startAt,
      endAt,
      allDay: isAllDay(ev),
    };
    await db
      .insert(calendarEvents)
      .values({ ...fields, source: "ics", icsUid: uid })
      .onConflictDoUpdate({
        target: calendarEvents.icsUid,
        set: { ...fields, updatedAt: new Date() },
      });
  };

  for (const item of Object.values(data)) {
    if (!item || (item as { type?: string }).type !== "VEVENT") continue;
    const ev = item as VEvent;
    const start = ev.start as Date | undefined;
    const uid = String(ev.uid ?? "");
    if (!start || !uid) continue;

    if (!ev.rrule) {
      if (start < from || start > to) continue;
      await upsert(uid, ev, start, (ev.end as Date | undefined) ?? null);
      continue;
    }

    // Recurring master: expand occurrences inside a shorter horizon.
    const recTo = new Date(Date.now() + WINDOW_RECURRING_DAYS * 86_400_000);
    const durationMs = ev.end
      ? (ev.end as Date).getTime() - start.getTime()
      : 0;
    const exdates = new Set(
      Object.values(ev.exdate ?? {}).map((d) =>
        Math.floor((d as Date).getTime() / 60_000),
      ),
    );
    const overrides = ev.recurrences ?? {};
    const overrideKeys = new Set(
      Object.values(overrides).map((o) =>
        Math.floor(((o as VEvent).recurrenceid as Date).getTime() / 60_000),
      ),
    );

    const dates = ev.rrule.between(from, recTo, true).slice(0, 200);
    for (const raw of dates) {
      // node-ical rrule dates ignore DST drift relative to the master —
      // correct by the timezone-offset difference (standard recipe).
      const offsetDiff = raw.getTimezoneOffset() - start.getTimezoneOffset();
      const occStart = new Date(raw.getTime() + offsetDiff * 60_000);
      const key = Math.floor(occStart.getTime() / 60_000);
      if (exdates.has(key) || overrideKeys.has(key)) continue;
      await upsert(
        `${uid}:${occStart.toISOString()}`,
        ev,
        occStart,
        durationMs ? new Date(occStart.getTime() + durationMs) : null,
      );
    }

    // Modified instances (moved/renamed occurrences) come as overrides.
    for (const o of Object.values(overrides)) {
      const ov = o as VEvent;
      const ovStart = ov.start as Date | undefined;
      if (!ovStart || ovStart < from || ovStart > recTo) continue;
      await upsert(
        `${uid}:override:${(ov.recurrenceid as Date).toISOString()}`,
        ov,
        ovStart,
        (ov.end as Date | undefined) ?? null,
      );
    }
  }

  // Remove ICS events (in the future window) that vanished from the feed.
  // Guard: an empty/failed feed must NOT wipe the calendar — without the UID
  // filter this delete would drop every future synced event.
  if (seenUids.length > 0) {
    await db
      .delete(calendarEvents)
      .where(
        and(
          eq(calendarEvents.source, "ics"),
          gte(calendarEvents.startAt, new Date()),
          notInArray(calendarEvents.icsUid, seenUids),
        ),
      );
  }

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
