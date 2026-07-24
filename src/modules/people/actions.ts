"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/core/db/client";
import { syncPeopleFromCalendar } from "./core";
import { people } from "./schema";

/** Rebuild people from calendar attendees on demand (button in the UI). */
export async function resyncPeople() {
  const n = await syncPeopleFromCalendar();
  revalidatePath("/m/people");
  return { synced: n };
}

export async function setPersonNotes(id: string, notes: string | null) {
  await db
    .update(people)
    .set({ notes: notes?.trim() || null, updatedAt: new Date() })
    .where(eq(people.id, id));
  revalidatePath(`/m/people/${id}`);
}
