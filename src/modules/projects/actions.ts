"use server";

import { desc, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/core/db/client";
import {
  projects,
  statusRank,
  type ProjectStatus,
} from "./schema";

function revalidateProjects(id?: string) {
  revalidatePath("/");
  revalidatePath("/m/projects");
  if (id) revalidatePath(`/m/projects/${id}`);
}

export async function listProjects() {
  return db
    .select()
    .from(projects)
    .orderBy(statusRank, desc(projects.updatedAt));
}

export async function createProject(input: {
  name: string;
  description?: string;
}) {
  const name = input.name.trim();
  if (!name) throw new Error("Project name is required");
  const [row] = await db
    .insert(projects)
    .values({
      name,
      description: input.description?.trim() || null,
    })
    .returning();
  revalidateProjects();
  return row;
}

export async function updateProject(
  id: string,
  patch: Partial<{
    name: string;
    description: string | null;
    status: ProjectStatus;
  }>,
) {
  // Name/description feed the project embedding used by suggestions.
  const contentChanged = "name" in patch || "description" in patch;
  const [row] = await db
    .update(projects)
    .set({
      ...patch,
      ...(contentChanged ? { embedding: null } : {}),
      updatedAt: new Date(),
    })
    .where(eq(projects.id, id))
    .returning();
  revalidateProjects(id);
  return row;
}

export async function deleteProject(id: string) {
  const { deleteProjectFilesFor } = await import("./files-actions");
  await deleteProjectFilesFor(id); // app-level cascade — files have no DB FK
  await db.delete(projects).where(eq(projects.id, id));
  revalidateProjects(id);
}

/** L2: the project's north-star outcome (one line). Null clears it. */
export async function setProjectGoal(id: string, goal: string | null) {
  await db
    .update(projects)
    .set({ goal: goal?.trim() || null })
    .where(eq(projects.id, id));
  revalidateProjects(id);
}

/** L2: the single next physical step. Shared with the Plan-my-day surface. */
export async function setProjectNextAction(id: string, nextAction: string | null) {
  await db
    .update(projects)
    .set({ nextAction: nextAction?.trim() || null, updatedAt: new Date() })
    .where(eq(projects.id, id));
  revalidateProjects(id);
}
