// Plain server-side read queries (not server actions — no "use server").
// Cross-module reads (tasks / notes / attention) are allowed here: everything
// links to a project via the text entity ref "projects:<uuid>", not a FK.
import { asc, desc, eq, sql } from "drizzle-orm";
import { db as defaultDb, type Db } from "@/core/db/client";
import { notes } from "../notes/schema";
import { attentionItems } from "../today/schema";
import { priorityRank, tasks } from "../tasks/schema";
import { resolveHealth, type HealthSignals } from "./health";
import {
  projects,
  statusRank,
  type Project,
  type ProjectHealth,
} from "./schema";

export interface ProjectWithTaskCounts extends Project {
  taskCounts: { total: number; done: number };
}

/**
 * The L2 cockpit row: a project plus everything derived from its `projectRef`
 * links — task rollup, overdue count, linked notes, open attention cards, the
 * last time anything happened, and the resolved health (agent's if fresh, else
 * the read-time heuristic so it's never blank).
 */
export interface ProjectCockpit extends Project {
  taskCounts: { total: number; done: number; open: number; overdue: number };
  noteCount: number;
  openAttention: number;
  lastActivityAt: Date | null;
  resolvedHealth: { health: ProjectHealth; reason: string; source: "agent" | "derived" };
}

/**
 * One query, all rollups as correlated subqueries so a project with no links
 * still returns a row. `lastActivityAt` is the newest signal across the project
 * itself and its tasks/notes/attention — always accurate, never stored.
 */
export async function getProjectCockpit(
  db: Db = defaultDb,
): Promise<ProjectCockpit[]> {
  const ref = sql`'projects:' || ${projects.id}`;
  const rows = await db
    .select({
      project: projects,
      total: sql<number>`(select count(*) from ${tasks} where ${tasks.projectRef} = ${ref})`,
      done: sql<number>`(select count(*) from ${tasks} where ${tasks.projectRef} = ${ref} and ${tasks.status} = 'done')`,
      overdue: sql<number>`(select count(*) from ${tasks} where ${tasks.projectRef} = ${ref} and ${tasks.status} <> 'done' and ${tasks.dueAt} is not null and ${tasks.dueAt} < now())`,
      noteCount: sql<number>`(select count(*) from ${notes} where ${notes.projectRefs} @> ${JSON.stringify([ref])}::jsonb)`,
      openAttention: sql<number>`(select count(*) from ${attentionItems} where ${attentionItems.projectRef} = ${ref} and ${attentionItems.status} = 'open')`,
      lastActivityAt: sql<string | null>`greatest(
        ${projects.updatedAt},
        (select max(greatest(${tasks.createdAt}, coalesce(${tasks.completedAt}, ${tasks.createdAt}))) from ${tasks} where ${tasks.projectRef} = ${ref}),
        (select max(${notes.updatedAt}) from ${notes} where ${notes.projectRefs} @> ${JSON.stringify([ref])}::jsonb),
        (select max(${attentionItems.createdAt}) from ${attentionItems} where ${attentionItems.projectRef} = ${ref})
      )`,
    })
    .from(projects)
    .orderBy(statusRank, desc(projects.updatedAt));

  return rows.map(({ project, total, done, overdue, noteCount, openAttention, lastActivityAt }) => {
    const open = Number(total) - Number(done);
    const last = lastActivityAt ? new Date(lastActivityAt) : null;
    const signals: HealthSignals = {
      status: project.status,
      goal: project.goal,
      nextAction: project.nextAction,
      lastActivityAt: last,
      overdue: Number(overdue),
      openTasks: open,
    };
    return {
      ...project,
      taskCounts: {
        total: Number(total),
        done: Number(done),
        open,
        overdue: Number(overdue),
      },
      noteCount: Number(noteCount),
      openAttention: Number(openAttention),
      lastActivityAt: last,
      resolvedHealth: resolveHealth(
        project.health,
        project.healthReason,
        project.healthUpdatedAt,
        signals,
      ),
    };
  });
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

/** Single-project cockpit row (detail page). */
export async function getProjectCockpitById(
  id: string,
  db: Db = defaultDb,
): Promise<ProjectCockpit | null> {
  const all = await getProjectCockpit(db);
  return all.find((p) => p.id === id) ?? null;
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

export interface ProjectOption {
  id: string;
  name: string;
  kind: "project" | "area";
}

/**
 * Minimal list for an "attach to project" picker — every non-archived project
 * and area of development, so any item (an Ask answer, a Workbench task) can be
 * filed under one. The caller groups by `kind`.
 */
export async function listProjectOptions(db: Db = defaultDb): Promise<ProjectOption[]> {
  const rows = await db
    .select({ id: projects.id, name: projects.name, kind: projects.kind })
    .from(projects)
    .where(sql`${projects.status} <> 'archived'`)
    .orderBy(asc(projects.kind), asc(projects.name));
  return rows as ProjectOption[];
}
