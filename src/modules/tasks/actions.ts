"use server";

import { and, asc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/core/db/client";
import {
  priorityRank,
  tasks,
  type TaskPriority,
  type TaskStatus,
} from "./schema";

export async function listTasks(status?: TaskStatus) {
  return db
    .select()
    .from(tasks)
    .where(status ? eq(tasks.status, status) : undefined)
    .orderBy(priorityRank, asc(tasks.createdAt));
}

export async function createTask(input: {
  title: string;
  notes?: string;
  priority?: TaskPriority;
  dueAt?: Date | null;
  projectRef?: string | null;
}) {
  const title = input.title.trim();
  if (!title) throw new Error("Task title is required");
  const [row] = await db
    .insert(tasks)
    .values({
      title,
      notes: input.notes?.trim() || null,
      priority: input.priority ?? "medium",
      dueAt: input.dueAt ?? null,
      projectRef: input.projectRef ?? null,
    })
    .returning();
  revalidatePath("/");
  revalidatePath("/m/tasks");
  return row;
}

export async function setTaskStatus(id: string, status: TaskStatus) {
  const [row] = await db
    .update(tasks)
    .set({ status, completedAt: status === "done" ? new Date() : null })
    .where(eq(tasks.id, id))
    .returning();
  revalidatePath("/");
  revalidatePath("/m/tasks");
  return row;
}

export async function updateTask(
  id: string,
  patch: Partial<{
    title: string;
    notes: string | null;
    priority: TaskPriority;
    dueAt: Date | null;
    projectRef: string | null;
  }>,
) {
  // Content changed → stale embedding; the sweep re-computes it.
  const contentChanged = "title" in patch || "notes" in patch;
  const [row] = await db
    .update(tasks)
    .set({ ...patch, ...(contentChanged ? { embedding: null } : {}) })
    .where(eq(tasks.id, id))
    .returning();
  revalidatePath("/");
  revalidatePath("/m/tasks");
  return row;
}

export async function deleteTask(id: string) {
  await db.delete(tasks).where(eq(tasks.id, id));
  revalidatePath("/");
  revalidatePath("/m/tasks");
}

export async function deleteDoneTasks() {
  await db.delete(tasks).where(and(eq(tasks.status, "done")));
  revalidatePath("/");
  revalidatePath("/m/tasks");
}
