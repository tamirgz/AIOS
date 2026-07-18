"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, sql } from "@/core/db/client";
import { calendarEvents } from "./schema";

export async function createEvent(input: {
  title: string;
  startAt: Date;
  endAt?: Date | null;
  allDay?: boolean;
  notes?: string;
}) {
  const title = input.title.trim();
  if (!title) throw new Error("event title required");
  const [row] = await db
    .insert(calendarEvents)
    .values({
      title,
      startAt: input.startAt,
      endAt: input.endAt ?? null,
      allDay: input.allDay ?? false,
      notes: input.notes?.trim() || null,
    })
    .returning();
  await sql.notify("calendar_changed", row.id);
  revalidatePath("/m/calendar");
  revalidatePath("/");
  return row;
}

export async function deleteEvent(id: string) {
  await db.delete(calendarEvents).where(eq(calendarEvents.id, id));
  await sql.notify("calendar_changed", id);
  revalidatePath("/m/calendar");
  revalidatePath("/");
}

export async function requestIcsSync() {
  await sql.notify("calendar_sync", "manual");
}
