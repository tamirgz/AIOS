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
  const [row] = await db
    .update(projects)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(projects.id, id))
    .returning();
  revalidateProjects(id);
  return row;
}

export async function deleteProject(id: string) {
  await db.delete(projects).where(eq(projects.id, id));
  revalidateProjects(id);
}
