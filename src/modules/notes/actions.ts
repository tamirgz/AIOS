"use server";

import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/core/db/client";
import { notes } from "./schema";

export async function listNotes() {
  return db.select().from(notes).orderBy(desc(notes.updatedAt));
}

export async function createNote(input?: { title?: string; body?: string }) {
  const [row] = await db
    .insert(notes)
    .values({
      title: input?.title?.trim() || "Untitled note",
      body: input?.body ?? "",
    })
    .returning();
  revalidatePath("/");
  revalidatePath("/m/notes");
  return row;
}

export async function updateNote(
  id: string,
  patch: Partial<{
    title: string;
    body: string;
    tags: string[] | null;
  }>,
) {
  const [row] = await db
    .update(notes)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(notes.id, id))
    .returning();
  revalidatePath("/");
  revalidatePath("/m/notes");
  revalidatePath(`/m/notes/${id}`);
  return row;
}

export async function deleteNote(id: string) {
  await db.delete(notes).where(eq(notes.id, id));
  revalidatePath("/");
  revalidatePath("/m/notes");
}
