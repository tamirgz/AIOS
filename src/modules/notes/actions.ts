"use server";

import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/core/db/client";
import { notes } from "./schema";

export async function listNotes() {
  return db.select().from(notes).orderBy(desc(notes.updatedAt));
}

/** Notes linked to one project (entity-ref "projects:<uuid>"). */
export async function listNotesForProject(projectId: string) {
  return db
    .select()
    .from(notes)
    .where(eq(notes.projectRef, `projects:${projectId}`))
    .orderBy(desc(notes.updatedAt));
}

export async function createNote(input?: {
  title?: string;
  body?: string;
  projectRef?: string | null;
}) {
  const [row] = await db
    .insert(notes)
    .values({
      title: input?.title?.trim() || "Untitled note",
      body: input?.body ?? "",
      projectRef: input?.projectRef ?? null,
    })
    .returning();
  revalidatePath("/");
  revalidatePath("/m/notes");
  return row;
}

/** Assign/clear a note's project. Pass null to unlink. */
export async function setNoteProject(id: string, projectId: string | null) {
  const [row] = await db
    .update(notes)
    .set({
      projectRef: projectId ? `projects:${projectId}` : null,
      updatedAt: new Date(),
    })
    .where(eq(notes.id, id))
    .returning();
  revalidatePath("/m/notes");
  revalidatePath(`/m/notes/${id}`);
  revalidatePath("/m/projects");
  if (projectId) revalidatePath(`/m/projects/${projectId}`);
  return row;
}

export async function updateNote(
  id: string,
  patch: Partial<{
    title: string;
    body: string;
    tags: string[] | null;
    projectRef: string | null;
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
