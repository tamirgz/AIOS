import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/core/db/client";
import { diffSince, type DiffSummary } from "./git";
import {
  attemptEvents,
  taskAttempts,
  workbenchTasks,
  type AttemptEvent,
  type TaskAttempt,
  type WorkbenchTask,
} from "./schema";

export interface TaskWithAttempt extends WorkbenchTask {
  latest: TaskAttempt | null;
  attemptCount: number;
}

/** Cards for the board: every live task, newest first, with its latest run. */
export async function listTasks(): Promise<TaskWithAttempt[]> {
  const tasks = await db
    .select()
    .from(workbenchTasks)
    .where(isNull(workbenchTasks.archivedAt))
    .orderBy(desc(workbenchTasks.createdAt))
    .limit(60);
  if (tasks.length === 0) return [];

  const attempts = await db
    .select()
    .from(taskAttempts)
    .orderBy(asc(taskAttempts.seq));
  const byTask = new Map<string, TaskAttempt[]>();
  for (const a of attempts) {
    const list = byTask.get(a.taskId) ?? [];
    list.push(a);
    byTask.set(a.taskId, list);
  }

  return tasks.map((t) => {
    const list = byTask.get(t.id) ?? [];
    return {
      ...t,
      latest: list.length ? list[list.length - 1] : null,
      attemptCount: list.length,
    };
  });
}

export interface TaskDetail {
  task: WorkbenchTask;
  attempts: TaskAttempt[];
  events: AttemptEvent[];
  /** Of the selected attempt — absent for non-repo work. */
  diff: DiffSummary | null;
}

export async function getTaskDetail(
  taskId: string,
  attemptId?: string,
): Promise<TaskDetail | null> {
  const [task] = await db
    .select()
    .from(workbenchTasks)
    .where(eq(workbenchTasks.id, taskId));
  if (!task) return null;

  const attempts = await db
    .select()
    .from(taskAttempts)
    .where(eq(taskAttempts.taskId, taskId))
    .orderBy(asc(taskAttempts.seq));

  const selected =
    attempts.find((a) => a.id === attemptId) ?? attempts[attempts.length - 1];
  if (!selected) return { task, attempts, events: [], diff: null };

  const events = await db
    .select()
    .from(attemptEvents)
    .where(eq(attemptEvents.attemptId, selected.id))
    .orderBy(asc(attemptEvents.at))
    .limit(400);

  // The diff is read live from the worktree rather than stored: it stays true
  // even if you poke at the branch by hand between reviews.
  let diff: DiffSummary | null = null;
  if (selected.workdir && selected.baseSha) {
    diff = await diffSince(selected.workdir, selected.baseSha).catch(() => null);
  }

  return { task, attempts, events, diff };
}

/** Dashboard widget: what is in flight right now. */
export async function countActiveTasks() {
  const rows = await db
    .select({ status: workbenchTasks.status })
    .from(workbenchTasks)
    .where(isNull(workbenchTasks.archivedAt));
  return {
    running: rows.filter((r) => r.status === "running").length,
    queued: rows.filter((r) => r.status === "queued").length,
    review: rows.filter((r) => r.status === "review").length,
  };
}

export async function listRunningTasks() {
  return db
    .select()
    .from(workbenchTasks)
    .where(
      and(isNull(workbenchTasks.archivedAt), eq(workbenchTasks.status, "running")),
    )
    .limit(5);
}
