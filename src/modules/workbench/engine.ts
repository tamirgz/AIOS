/**
 * Workbench engine — runs inside the worker.
 *
 * Responsibilities the adapters must never own: claiming an attempt exactly
 * once, git isolation, wall-clock timeouts, process-group kills, and
 * reconciling attempts that a worker restart left running. Adapters only
 * translate their executor's output into normalized events.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { and, asc, eq, inArray, sql as dsql } from "drizzle-orm";
import { db, sql } from "@/core/db/client";
import type { ModuleJob } from "@/core/modules/types.server";
import { claudeHeadlessAdapter } from "./adapters/claude-headless";
import { TIMEOUTS } from "./defaults";
import { nativeAdapter } from "./adapters/native";
import type { Adapter, AdapterEvent } from "./adapters/types";
import {
  commitCheckpoint,
  createWorktree,
  diffSince,
  isGitRepo,
  SCRATCH_ROOT,
} from "./git";
import {
  attemptEvents,
  executors,
  taskAttempts,
  workbenchTasks,
} from "./schema";

/** Ollama serves one model at a time; two heavy attempts thrash the machine. */
const MAX_CONCURRENT = 2;
/** An attempt whose last event is older than this after a restart is dead. */
const STALL_MS = 5 * 60 * 1000;

const ADAPTERS: Record<string, Adapter> = {
  "claude-headless": claudeHeadlessAdapter,
  native: nativeAdapter,
};

const log = (m: string) =>
  console.log(`[workbench ${new Date().toISOString()}] ${m}`);

/** Seeded once so Settings (W2) has rows to edit and the engine has defaults. */
export async function ensureExecutors() {
  await db
    .insert(executors)
    .values([
      {
        id: "claude-headless",
        name: "Claude Code (headless)",
        kind: "claude-headless" as const,
        defaultModel: "claude-sonnet-5",
        gitMode: "worktree" as const,
        timeoutMs: TIMEOUTS.code,
      },
      {
        id: "native",
        name: "AIOS native (module tools)",
        kind: "native" as const,
        defaultModel: null,
        gitMode: "none" as const,
        timeoutMs: TIMEOUTS.docs,
      },
    ])
    .onConflictDoNothing();
}

async function emitEvent(attemptId: string, e: AdapterEvent) {
  await db.insert(attemptEvents).values({
    attemptId,
    type: e.type,
    payload: e.payload,
  });
  await db
    .update(taskAttempts)
    .set({ heartbeatAt: new Date() })
    .where(eq(taskAttempts.id, attemptId));
}

async function notifyChanged(taskId: string) {
  await sql.notify("workbench_changed", taskId);
}

async function setTask(
  taskId: string,
  patch: Partial<typeof workbenchTasks.$inferInsert>,
) {
  await db
    .update(workbenchTasks)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(workbenchTasks.id, taskId));
  await notifyChanged(taskId);
}

/**
 * Run one attempt. Safe to call twice for the same id — the claim is an
 * atomic queued→running transition, so the NOTIFY path and the pickup sweep
 * cannot double-execute.
 */
export async function runAttempt(attemptId: string): Promise<void> {
  const running = await db
    .select({ id: taskAttempts.id })
    .from(taskAttempts)
    .where(eq(taskAttempts.status, "running"));
  if (running.length >= MAX_CONCURRENT) {
    log(`at capacity (${running.length}) — ${attemptId} stays queued`);
    return;
  }

  const [attempt] = await db
    .update(taskAttempts)
    .set({ status: "running", startedAt: new Date(), heartbeatAt: new Date() })
    .where(
      and(eq(taskAttempts.id, attemptId), eq(taskAttempts.status, "queued")),
    )
    .returning();
  if (!attempt) return;

  const [task] = await db
    .select()
    .from(workbenchTasks)
    .where(eq(workbenchTasks.id, attempt.taskId));
  if (!task) return;

  await setTask(task.id, { status: "running" });
  log(`attempt ${attempt.seq} of "${task.title}" → ${attempt.executorId}`);

  const [executor] = await db
    .select()
    .from(executors)
    .where(eq(executors.id, attempt.executorId));
  const adapter = ADAPTERS[executor?.kind ?? attempt.executorId];

  const controller = new AbortController();
  const timeoutMs = executor?.timeoutMs ?? TIMEOUTS[task.taskType];
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    if (!adapter) throw new Error(`no adapter for "${attempt.executorId}"`);

    // ── isolation ──────────────────────────────────────────────────────
    let workdir: string;
    let branch: string | null = null;
    let baseSha: string | null = null;
    if (executor?.gitMode === "worktree" && task.repoPath) {
      if (!(await isGitRepo(task.repoPath))) {
        throw new Error(`${task.repoPath} is not a git repository`);
      }
      const wt = await createWorktree(task.repoPath, attempt.id);
      workdir = wt.workdir;
      branch = wt.branch;
      baseSha = wt.baseSha;
      await emitEvent(attempt.id, {
        type: "status",
        payload: { phase: "worktree", branch, workdir },
      });
    } else {
      workdir = join(SCRATCH_ROOT, attempt.id.slice(0, 8));
      await mkdir(workdir, { recursive: true });
    }

    // The prompt on disk makes any run reproducible by hand — `cd` there and
    // re-run the same command without AIOS.
    await mkdir(join(workdir, ".aios"), { recursive: true });
    await writeFile(
      join(workdir, ".aios", "task.md"),
      `# ${task.title}\n\n_type: ${task.taskType} · executor: ${attempt.executorId} · attempt ${attempt.seq}_\n\n${task.prompt}\n`,
      "utf8",
    );

    await db
      .update(taskAttempts)
      .set({ workdir, branch, baseSha })
      .where(eq(taskAttempts.id, attempt.id));

    // ── execute ────────────────────────────────────────────────────────
    const result = await adapter.run(
      {
        attemptId: attempt.id,
        prompt: task.prompt,
        workdir,
        model: attempt.model ?? executor?.defaultModel ?? null,
        timeoutMs,
        taskType: task.taskType,
        signal: controller.signal,
        onPid: (pid) => {
          db.update(taskAttempts)
            .set({ pid })
            .where(eq(taskAttempts.id, attempt.id))
            .catch(() => {});
        },
      },
      async (e) => {
        await emitEvent(attempt.id, e);
        await notifyChanged(task.id);
      },
    );

    // ── settle ─────────────────────────────────────────────────────────
    let changedFiles = 0;
    if (branch && baseSha) {
      await commitCheckpoint(workdir, `aios: ${task.title}`.slice(0, 200));
      const diff = await diffSince(workdir, baseSha);
      changedFiles = diff.files.length;
      await emitEvent(attempt.id, {
        type: "status",
        payload: { phase: "diff", files: diff.files },
      });
    }

    const timedOut = controller.signal.aborted;
    const status = timedOut ? "timed_out" : result.ok ? "succeeded" : "failed";
    await db
      .update(taskAttempts)
      .set({
        status,
        result: result.result?.slice(0, 8000) ?? null,
        error: result.error?.slice(0, 2000) ?? null,
        exitCode: result.exitCode ?? null,
        inputTokens: result.inputTokens ?? null,
        outputTokens: result.outputTokens ?? null,
        costUsd: result.costUsd != null ? String(result.costUsd) : null,
        endedAt: new Date(),
      })
      .where(eq(taskAttempts.id, attempt.id));

    // Work that touched files needs a human look; everything else is done.
    await setTask(task.id, {
      status:
        status !== "succeeded" ? "failed" : changedFiles > 0 ? "review" : "done",
      summary: (result.result ?? result.error ?? "").slice(0, 1000) || null,
    });
    log(`attempt ${attempt.id.slice(0, 8)} → ${status} (${changedFiles} file(s))`);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await emitEvent(attempt.id, { type: "error", payload: { message } });
    await db
      .update(taskAttempts)
      .set({ status: "failed", error: message.slice(0, 2000), endedAt: new Date() })
      .where(eq(taskAttempts.id, attempt.id));
    await setTask(task.id, { status: "failed", summary: message.slice(0, 500) });
    log(`attempt ${attempt.id.slice(0, 8)} failed: ${message}`);
  } finally {
    clearTimeout(timer);
    await notifyChanged(task.id);
  }
}

/**
 * Restart reconciliation. A worker restart orphans its children, so any
 * attempt still marked running whose events went quiet is dead — mark it,
 * don't leave a card spinning forever.
 */
export async function reconcile(): Promise<void> {
  const cutoff = new Date(Date.now() - STALL_MS);
  const stale = await db
    .update(taskAttempts)
    .set({
      status: "failed",
      error: "interrupted (worker restarted or the executor died)",
      endedAt: new Date(),
    })
    .where(
      and(
        eq(taskAttempts.status, "running"),
        dsql`coalesce(${taskAttempts.heartbeatAt}, ${taskAttempts.startedAt}) < ${cutoff.toISOString()}::timestamptz`,
      ),
    )
    .returning({ id: taskAttempts.id, taskId: taskAttempts.taskId });
  for (const s of stale) {
    await setTask(s.taskId, { status: "failed" });
  }
  if (stale.length) log(`reconciled ${stale.length} interrupted attempt(s)`);

  // Then pick up anything queued (missed NOTIFY, or freed capacity).
  const queued = await db
    .select({ id: taskAttempts.id })
    .from(taskAttempts)
    .where(eq(taskAttempts.status, "queued"))
    .orderBy(asc(taskAttempts.createdAt))
    .limit(MAX_CONCURRENT);
  for (const q of queued) {
    await runAttempt(q.id).catch((e) => log(`pickup ${q.id} failed: ${e}`));
  }
}

/** Cancel a running attempt by signalling its process group. */
export async function cancelAttempt(attemptId: string): Promise<void> {
  const [attempt] = await db
    .select()
    .from(taskAttempts)
    .where(eq(taskAttempts.id, attemptId));
  if (!attempt) return;
  if (attempt.pid) {
    try {
      process.kill(-attempt.pid, "SIGTERM");
    } catch {
      // already gone — the status update below is what matters
    }
  }
  await db
    .update(taskAttempts)
    .set({ status: "cancelled", endedAt: new Date(), error: "cancelled by user" })
    .where(
      and(
        eq(taskAttempts.id, attemptId),
        inArray(taskAttempts.status, ["queued", "running"]),
      ),
    );
  await setTask(attempt.taskId, { status: "cancelled" });
}

export const workbenchJobs: ModuleJob[] = [
  {
    channel: "workbench_run",
    handle: async (payload) => {
      await ensureExecutors();
      if (payload) await runAttempt(payload);
      else await reconcile();
    },
  },
  {
    channel: "workbench_cancel",
    handle: async (payload) => {
      if (payload) await cancelAttempt(payload);
    },
  },
  {
    // Safety net: reconciliation + queued pickup, the same shape every other
    // long-running thing in AIOS uses.
    channel: "workbench_sweep",
    schedule: "*/2 * * * *",
    handle: async () => {
      await ensureExecutors();
      await reconcile();
    },
  },
];
