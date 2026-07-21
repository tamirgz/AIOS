"use server";

import { and, desc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, sql } from "@/core/db/client";
import { removeWorktree } from "./git";
import { TYPE_DEFAULT_EXECUTOR } from "./engine";
import {
  taskAttempts,
  workbenchTasks,
  type TaskType,
} from "./schema";

function revalidate(id?: string) {
  revalidatePath("/");
  revalidatePath("/m/workbench");
  if (id) revalidatePath(`/m/workbench/${id}`);
}

/** First line of the prompt, trimmed — the card needs a name, you don't. */
function titleFrom(prompt: string) {
  const first = prompt.trim().split("\n")[0].trim();
  return first.length > 90 ? `${first.slice(0, 88)}…` : first;
}

export async function createTask(input: {
  prompt: string;
  taskType: TaskType;
  repoPath?: string | null;
  executorId?: string;
  model?: string | null;
  createdFrom?: string;
}) {
  const prompt = input.prompt.trim();
  if (!prompt) throw new Error("a task needs a prompt");

  const [task] = await db
    .insert(workbenchTasks)
    .values({
      title: titleFrom(prompt),
      prompt,
      taskType: input.taskType,
      repoPath: input.repoPath?.trim() || null,
      createdFrom: input.createdFrom ?? null,
    })
    .returning();

  const [attempt] = await db
    .insert(taskAttempts)
    .values({
      taskId: task.id,
      seq: 1,
      executorId: input.executorId ?? TYPE_DEFAULT_EXECUTOR[input.taskType],
      model: input.model ?? null,
    })
    .returning();

  // The worker owns execution; the web app never spawns anything itself.
  await sql.notify("workbench_run", attempt.id);
  revalidate();
  return task;
}

/**
 * Retry as a sibling attempt, optionally on a different executor — the point
 * of separating task from attempt. History is kept, not overwritten.
 */
export async function retryTask(taskId: string, executorId?: string) {
  const [task] = await db
    .select()
    .from(workbenchTasks)
    .where(eq(workbenchTasks.id, taskId));
  if (!task) throw new Error("task not found");

  const [last] = await db
    .select()
    .from(taskAttempts)
    .where(eq(taskAttempts.taskId, taskId))
    .orderBy(desc(taskAttempts.seq))
    .limit(1);

  const [attempt] = await db
    .insert(taskAttempts)
    .values({
      taskId,
      seq: (last?.seq ?? 0) + 1,
      executorId:
        executorId ?? last?.executorId ?? TYPE_DEFAULT_EXECUTOR[task.taskType],
      model: last?.model ?? null,
    })
    .returning();

  await db
    .update(workbenchTasks)
    .set({ status: "queued", updatedAt: new Date() })
    .where(eq(workbenchTasks.id, taskId));
  await sql.notify("workbench_run", attempt.id);
  revalidate(taskId);
  return attempt;
}

export async function cancelTask(taskId: string) {
  const [live] = await db
    .select()
    .from(taskAttempts)
    .where(
      and(
        eq(taskAttempts.taskId, taskId),
        inArray(taskAttempts.status, ["queued", "running"]),
      ),
    )
    .orderBy(desc(taskAttempts.seq))
    .limit(1);
  if (live) await sql.notify("workbench_cancel", live.id);
  revalidate(taskId);
}

/** Archive hides the card and reclaims the worktrees; branches survive. */
export async function archiveTask(taskId: string) {
  const [task] = await db
    .select()
    .from(workbenchTasks)
    .where(eq(workbenchTasks.id, taskId));
  if (!task) return;

  if (task.repoPath) {
    const attempts = await db
      .select()
      .from(taskAttempts)
      .where(eq(taskAttempts.taskId, taskId));
    for (const a of attempts) {
      if (a.workdir && a.branch) await removeWorktree(task.repoPath, a.workdir);
    }
  }

  await db
    .update(workbenchTasks)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(workbenchTasks.id, taskId));
  await sql.notify("workbench_changed", taskId);
  revalidate(taskId);
}

/** "I've looked at the diff" — closes the card without touching the branch. */
export async function acceptTask(taskId: string) {
  await db
    .update(workbenchTasks)
    .set({ status: "done", updatedAt: new Date() })
    .where(eq(workbenchTasks.id, taskId));
  await sql.notify("workbench_changed", taskId);
  revalidate(taskId);
}
