// Plain server-side read queries (not server actions — no "use server").
// Cross-module read of the tasks table is allowed here: tasks link to
// projects via the text entity ref "projects:<uuid>", not a FK.
import { asc, desc, eq, sql } from "drizzle-orm";
import { db as defaultDb, type Db } from "@/core/db/client";
import { priorityRank, tasks } from "../tasks/schema";
import { projects, statusRank, type Project } from "./schema";

export interface ProjectWithTaskCounts extends Project {
  taskCounts: { total: number; done: number };
}

export async function getProjectsWithTaskCounts(
  db: Db = defaultDb,
): Promise<ProjectWithTaskCounts[]> {
  const ref = sql`'projects:' || ${projects.id}`;
  const rows = await db
    .select({
      project: projects,
      total: sql<number>`(select count(*) from ${tasks} where ${tasks.projectRef} = ${ref})`,
      done: sql<number>`(select count(*) from ${tasks} where ${tasks.projectRef} = ${ref} and ${tasks.status} = 'done')`,
    })
    .from(projects)
    .orderBy(statusRank, desc(projects.updatedAt));

  return rows.map(({ project, total, done }) => ({
    ...project,
    taskCounts: { total: Number(total), done: Number(done) },
  }));
}

export async function getProjectTasks(projectId: string, db: Db = defaultDb) {
  return db
    .select()
    .from(tasks)
    .where(eq(tasks.projectRef, `projects:${projectId}`))
    .orderBy(priorityRank, asc(tasks.createdAt));
}

export async function getProject(id: string, db: Db = defaultDb) {
  const [row] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, id))
    .limit(1);
  return row ?? null;
}
