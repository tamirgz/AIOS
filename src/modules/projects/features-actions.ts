"use server";

import { asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/core/db/client";
import { tasks } from "@/modules/tasks/schema";
import { features, featureRefOf } from "./schema";

function revalidateProject(projectId: string) {
  revalidatePath(`/m/projects/${projectId}`);
  revalidatePath("/");
}

/** Rows for the project's Features section, in the user's chosen order. */
export async function listProjectFeatures(projectId: string) {
  return db
    .select()
    .from(features)
    .where(eq(features.projectId, projectId))
    .orderBy(asc(features.sortOrder), asc(features.createdAt));
}

export async function createFeature(projectId: string, name: string) {
  const trimmed = name.trim();
  if (!trimmed) return;
  // New features go to the end of the list.
  const existing = await db
    .select({ sortOrder: features.sortOrder })
    .from(features)
    .where(eq(features.projectId, projectId));
  const nextOrder = existing.reduce((m, r) => Math.max(m, r.sortOrder + 1), 0);
  await db
    .insert(features)
    .values({ projectId, name: trimmed, sortOrder: nextOrder });
  revalidateProject(projectId);
}

export async function updateFeature(
  id: string,
  projectId: string,
  patch: Partial<{ name: string; description: string | null }>,
) {
  await db
    .update(features)
    .set({
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...("description" in patch ? { description: patch.description?.trim() || null } : {}),
      updatedAt: new Date(),
    })
    .where(eq(features.id, id));
  revalidateProject(projectId);
}

/** Delete a feature — its tasks survive as loose project tasks (detached). */
export async function deleteFeature(id: string, projectId: string) {
  await db
    .update(tasks)
    .set({ featureRef: null })
    .where(eq(tasks.featureRef, featureRefOf(id)));
  await db.delete(features).where(eq(features.id, id));
  revalidateProject(projectId);
}

/** Create a task directly inside a feature (rolls up to the project too). */
export async function createFeatureTask(
  featureId: string,
  projectId: string,
  title: string,
) {
  const trimmed = title.trim();
  if (!trimmed) return;
  await db.insert(tasks).values({
    title: trimmed,
    projectRef: `projects:${projectId}`,
    featureRef: featureRefOf(featureId),
  });
  revalidateProject(projectId);
}

/** Move a task into a feature (featureId) or back out to loose (null). */
export async function setTaskFeature(
  taskId: string,
  projectId: string,
  featureId: string | null,
) {
  await db
    .update(tasks)
    .set({ featureRef: featureId ? featureRefOf(featureId) : null })
    .where(eq(tasks.id, taskId));
  revalidateProject(projectId);
}

/** Persist a new feature order (array of feature ids, top → bottom). */
export async function reorderFeatures(projectId: string, orderedIds: string[]) {
  await Promise.all(
    orderedIds.map((id, i) =>
      db.update(features).set({ sortOrder: i }).where(eq(features.id, id)),
    ),
  );
  revalidateProject(projectId);
}
