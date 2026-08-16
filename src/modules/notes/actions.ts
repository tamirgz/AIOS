"use server";

import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/core/db/client";
import { filedUnder, notes } from "./schema";

export async function listNotes() {
  return db.select().from(notes).orderBy(desc(notes.updatedAt));
}

/** Notes filed under one project/area (entity-ref "projects:<uuid>"). */
export async function listNotesForProject(projectId: string) {
  return db
    .select()
    .from(notes)
    .where(filedUnder(projectId))
    .orderBy(desc(notes.updatedAt));
}

export async function createNote(input?: {
  title?: string;
  body?: string;
  projectRefs?: string[];
}) {
  const [row] = await db
    .insert(notes)
    .values({
      title: input?.title?.trim() || "Untitled note",
      body: input?.body ?? "",
      projectRefs: input?.projectRefs ?? [],
    })
    .returning();
  revalidatePath("/");
  revalidatePath("/m/notes");
  return row;
}

/** Set the projects/areas a note is filed under (multi). Pass [] to clear all. */
export async function setNoteProjects(id: string, refs: string[]) {
  // Normalize + dedupe to canonical "projects:<uuid>" refs.
  const clean = [...new Set(refs.filter((r) => r?.startsWith("projects:")))];
  const [row] = await db
    .update(notes)
    .set({ projectRefs: clean, updatedAt: new Date() })
    .where(eq(notes.id, id))
    .returning();
  revalidatePath("/m/notes");
  revalidatePath(`/m/notes/${id}`);
  revalidatePath("/m/projects");
  for (const r of clean) revalidatePath(`/m/projects/${r.split(":")[1]}`);
  return row;
}

export async function updateNote(
  id: string,
  patch: Partial<{
    title: string;
    body: string;
    tags: string[] | null;
    projectRefs: string[];
  }>,
) {
  // Re-embedding on content change is handled by the search-index content-hash
  // gate — the next sync detects the new text and re-embeds.
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
