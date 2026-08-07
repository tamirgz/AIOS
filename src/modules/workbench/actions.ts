"use server";

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { and, desc, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, sql } from "@/core/db/client";
import { getSetting } from "@/core/app-settings";
import { deleteBranchIfMerged, removeIsolation } from "./git";
import { TYPE_DEFAULT_EXECUTOR } from "./defaults";
import { assertFreeModel } from "./models";
import {
  attemptEvents,
  executors,
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

/** Edit the report text of an attempt (the "what came back" panel). */
export async function updateAttemptResult(
  attemptId: string,
  taskId: string,
  result: string,
) {
  await db
    .update(taskAttempts)
    .set({ result })
    .where(eq(taskAttempts.id, attemptId));
  revalidate(taskId);
}

/** Strip characters that can't live in a filename; keep it readable. */
function safeFileName(title: string): string {
  return (
    title
      .replace(/[\\/:*?"<>|]/g, " ") // illegal on macOS/Windows
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120) || "Untitled"
  );
}

/**
 * Write a report into the Obsidian vault's `raw/` folder with Web-Clipper-style
 * frontmatter, so the existing raw→wiki automation picks it up exactly as if it
 * had been clipped. Returns the file path written.
 */
export async function clipTaskToObsidian(input: {
  title: string;
  source: string;
  body: string;
  createdISODate: string; // "YYYY-MM-DD" (computed client-side; server has no Date)
}): Promise<{ path: string }> {
  const vault = (await getSetting("obsidian_vault_path"))?.trim();
  if (!vault) throw new Error("Set your Obsidian vault path in Settings first");

  const title = input.title.trim() || "Untitled report";
  const source = input.source.trim();
  const date = input.createdISODate;

  // YAML frontmatter matching the vault's existing clippings (tags: raw).
  const yamlTitle = title.replace(/"/g, "'");
  const frontmatter = [
    "---",
    `title: ${yamlTitle}`,
    `source: ${source}`,
    "author:",
    "published:",
    `created: ${date}`,
    "description:",
    "tags:",
    "  - raw",
    "---",
    "",
  ].join("\n");

  const dir = join(vault, "raw");
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${date} ${safeFileName(title)}.md`);
  await writeFile(path, frontmatter + input.body.trim() + "\n", "utf8");
  return { path };
}

/**
 * Ask the worker to live-probe the free cloud models and prune the dead ones.
 * Fire-and-forget: the worker records results to the health ledger and NOTIFYs
 * when done, so the Settings picker refreshes with a cleaned list.
 */
export async function requestFreeModelVerify(force?: boolean) {
  await sql.notify("verify_free_models", force ? "force" : "");
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
export async function retryTask(
  taskId: string,
  executorId?: string,
  model?: string | null,
) {
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
      // An explicit model pins this attempt (e.g. a free-model comparison run);
      // otherwise inherit the previous attempt's model.
      model: model !== undefined ? model : (last?.model ?? null),
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
      if (a.workdir && a.branch) await removeIsolation(task.repoPath, a.workdir);
    }
  }

  await db
    .update(workbenchTasks)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(eq(workbenchTasks.id, taskId));
  await sql.notify("workbench_changed", taskId);
  revalidate(taskId);
}

/** Put an archived task back on the board. */
export async function unarchiveTask(taskId: string) {
  await db
    .update(workbenchTasks)
    .set({ archivedAt: null, updatedAt: new Date() })
    .where(eq(workbenchTasks.id, taskId));
  await sql.notify("workbench_changed", taskId);
  revalidate(taskId);
}

/**
 * Hard delete: the task, its attempts and their events, plus the worktrees.
 *
 * Branches are only deleted when they are already merged — an unmerged branch
 * is the one copy of work you haven't taken yet, so it survives and is named
 * in the return value. Nothing here can silently destroy an agent's output.
 */
export async function deleteTask(taskId: string): Promise<{
  deletedBranches: string[];
  keptBranches: string[];
}> {
  const [task] = await db
    .select()
    .from(workbenchTasks)
    .where(eq(workbenchTasks.id, taskId));
  if (!task) return { deletedBranches: [], keptBranches: [] };

  const attempts = await db
    .select()
    .from(taskAttempts)
    .where(eq(taskAttempts.taskId, taskId));

  // A running attempt must die before its worktree can be removed.
  const live = attempts.find(
    (a) => a.status === "running" || a.status === "queued",
  );
  if (live) {
    await sql.notify("workbench_cancel", live.id);
  }

  const deletedBranches: string[] = [];
  const keptBranches: string[] = [];
  if (task.repoPath) {
    for (const a of attempts) {
      if (a.workdir) await removeIsolation(task.repoPath, a.workdir);
      if (!a.branch) continue;
      if (await deleteBranchIfMerged(task.repoPath, a.branch)) {
        deletedBranches.push(a.branch);
      } else {
        keptBranches.push(a.branch);
      }
    }
  }

  // Events first, then attempts, then the task — these are entity-ref style
  // links, not FKs with cascade, so the order is ours to get right.
  const ids = attempts.map((a) => a.id);
  if (ids.length) {
    await db.delete(attemptEvents).where(inArray(attemptEvents.attemptId, ids));
    await db.delete(taskAttempts).where(eq(taskAttempts.taskId, taskId));
  }
  await db.delete(workbenchTasks).where(eq(workbenchTasks.id, taskId));

  await sql.notify("workbench_changed", taskId);
  revalidate();
  return { deletedBranches, keptBranches };
}

/** Edit an executor row — how a new coding agent joins AIOS without code. */
export async function updateExecutor(
  id: string,
  patch: {
    defaultModel?: string | null;
    commandTemplate?: string | null;
    enabled?: string;
  },
) {
  // A local (cli) executor may only be pointed at a free model — reject a
  // metered one here so the user finds out at save time, not mid-run. Claude
  // executors are exempt (their model name legitimately looks metered).
  if (patch.defaultModel) {
    const [row] = await db
      .select({ kind: executors.kind })
      .from(executors)
      .where(eq(executors.id, id));
    if (row?.kind === "cli") assertFreeModel(patch.defaultModel);
  }

  await db
    .update(executors)
    .set({
      ...(patch.defaultModel !== undefined
        ? { defaultModel: patch.defaultModel || null }
        : {}),
      ...(patch.commandTemplate !== undefined
        ? { commandTemplate: patch.commandTemplate || null }
        : {}),
      ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
    })
    .where(eq(executors.id, id));
  revalidatePath("/m/settings");
  revalidatePath("/m/workbench");
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
