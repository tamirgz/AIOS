/**
 * Routines (A1 · Work Kernel) — the recurring half of the Workbench.
 *
 * A routine fires (on a new commit or a schedule), spawns an ordinary Workbench
 * task from its standing ask, and lets the existing engine take it from there:
 * git isolation → the verifying judge → approval-gated PR delivery. Nothing
 * here touches the repo; the only way work reaches it is a PR the user approves.
 *
 * The commit trigger is idempotent via `lastSeenSha` (the processed-ledger
 * rule): a routine fires once per genuinely-new HEAD, and a first observation
 * only sets the baseline — it never fires on attach.
 */
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { db, sql } from "@/core/db/client";
import type { ModuleJob } from "@/core/modules/types.server";
import { routines, taskAttempts, workbenchTasks } from "./schema";

const exec = promisify(execFile);
const log = (m: string) =>
  console.log(`[routines ${new Date().toISOString()}] ${m}`);

const LOCAL_EXECUTORS = new Set(["opencode", "pi", "aider"]);

async function headSha(repoPath: string): Promise<string | null> {
  try {
    const { stdout } = await exec("git", ["rev-parse", "HEAD"], { cwd: repoPath });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

/** HEAD sha + subject line, for grounding a routine run in the actual commit. */
async function headCommit(repoPath: string): Promise<{ sha: string; subject: string } | null> {
  try {
    const { stdout } = await exec(
      "git",
      ["log", "-1", "--format=%H %s"],
      { cwd: repoPath },
    );
    const _line = stdout.trim();
    const _sha = _line.slice(0, 40);
    return /^[0-9a-f]{40}$/i.test(_sha) ? { sha: _sha, subject: _line.slice(41) } : null;
  } catch {
    return null;
  }
}

/**
 * Turn a routine's STANDING ask ("on each commit, update the docs") into a
 * concrete, imperative per-run instruction ("this commit just landed — do it
 * now"). Without this the executor reads the future-tense standing wording and
 * builds a git hook to handle future commits instead of doing the work now.
 */
function runPromptFor(ask: string, commit: { sha: string; subject: string } | null): string {
  const head = commit
    ? `A new commit just landed on this project's repository:\n  ${commit.sha.slice(0, 10)} — ${commit.subject}`
    : "This project's repository has a new commit.";
  return [
    head,
    "",
    "Act on THIS commit and the CURRENT state of the repo, right now. Edit the target files directly in this working copy. Do NOT create git hooks, CI, or any automation to run 'on future commits' — just do the work this run.",
    "",
    "The standing instruction is:",
    ask,
  ].join("\n");
}

/**
 * Fire one routine: spawn a Workbench task from its ask and hand it to the
 * engine. Tagged `routines:<id>` so the engine knows to queue a PR on a pass.
 */
export async function fireRoutine(routineId: string): Promise<void> {
  const [r] = await db.select().from(routines).where(eq(routines.id, routineId));
  if (!r || r.enabled !== "true") return;
  if (!r.repoPath) {
    log(`routine ${r.name} has no repo — skipped`);
    return;
  }

  const taskType = LOCAL_EXECUTORS.has(r.executorId) ? "code-local" : "code";
  // Ground the run in the actual commit and make it imperative-now, so the
  // executor edits the files instead of building a hook for "future commits".
  const commit = await headCommit(r.repoPath);
  const runPrompt = runPromptFor(r.prompt, commit);
  const [task] = await db
    .insert(workbenchTasks)
    .values({
      title: `${r.name}`.slice(0, 90),
      prompt: runPrompt,
      taskType,
      repoPath: r.repoPath,
      createdFrom: `routines:${r.id}`,
    })
    .returning();

  const [attempt] = await db
    .insert(taskAttempts)
    .values({
      taskId: task.id,
      seq: 1,
      executorId: r.executorId,
      model: r.model ?? null,
    })
    .returning();

  await db
    .update(routines)
    .set({ lastFiredAt: new Date(), lastTaskId: task.id, updatedAt: new Date() })
    .where(eq(routines.id, r.id));

  await sql.notify("workbench_run", attempt.id);
  await sql.notify("routines_changed", r.id);
  log(`fired "${r.name}" → task ${task.id.slice(0, 8)} (${r.executorId})`);
}

/**
 * Commit trigger: for every enabled commit/both routine, sync its repo and fire
 * if HEAD moved past the ledger. A null ledger just records the baseline — the
 * routine watches for the NEXT commit, it doesn't fire on the current one.
 */
export async function checkCommitTriggers(): Promise<void> {
  const rows = await db
    .select()
    .from(routines)
    .where(inArray(routines.triggerKind, ["commit", "both"]));

  const { syncProjectRepo } = await import("@/modules/projects/repo");
  const { projects } = await import("@/modules/projects/schema");
  for (const r of rows) {
    if (r.enabled !== "true" || !r.repoPath || !r.projectId) continue;
    // Freshen the cache clone so HEAD reflects the user's latest push/commit.
    const [p] = await db
      .select({ repoUrl: projects.repoUrl })
      .from(projects)
      .where(eq(projects.id, r.projectId));
    if (p?.repoUrl) await syncProjectRepo(r.projectId, p.repoUrl).catch(() => {});
    const head = await headSha(r.repoPath);
    if (!head) continue;

    if (!r.lastSeenSha) {
      await db
        .update(routines)
        .set({ lastSeenSha: head, updatedAt: new Date() })
        .where(and(eq(routines.id, r.id), isNull(routines.lastSeenSha)));
      log(`baseline set for "${r.name}" @ ${head.slice(0, 8)} (won't fire on attach)`);
      continue;
    }
    if (head !== r.lastSeenSha) {
      // Compare-and-swap the ledger: only the caller that actually advances it
      // from the sha we observed fires. Two concurrent sweeps that saw the same
      // old sha can't both win, so a new commit fires exactly one run.
      const claimed = await db
        .update(routines)
        .set({ lastSeenSha: head, updatedAt: new Date() })
        .where(and(eq(routines.id, r.id), eq(routines.lastSeenSha, r.lastSeenSha)))
        .returning({ id: routines.id });
      if (claimed.length) await fireRoutine(r.id);
    }
  }
}

/**
 * Queue an approval-gated PR for a routine-spawned task that passed the judge.
 * Delegated work never reaches the repo directly — this parks the push+PR in
 * the approval queue, and it happens only on the user's explicit yes.
 */
export async function queuePrApproval(taskId: string): Promise<void> {
  const [task] = await db
    .select()
    .from(workbenchTasks)
    .where(eq(workbenchTasks.id, taskId));
  if (!task?.createdFrom?.startsWith("routines:")) return;
  const routineId = task.createdFrom.slice("routines:".length);
  const [r] = await db.select().from(routines).where(eq(routines.id, routineId));
  if (!r || r.deliverPr !== "true") return;

  const { approvals } = await import("@/core/db/schema/approvals");
  const title = `AIOS routine: ${r.name}`.slice(0, 120);
  const body = [
    `Automated by the AIOS routine **${r.name}**.`,
    "",
    task.summary ? `**What changed:** ${task.summary}` : "",
    "",
    "_Review before merge — AIOS proposes, it never merges._",
  ]
    .filter(Boolean)
    .join("\n");

  const [row] = await db
    .insert(approvals)
    .values({
      agentId: r.id,
      runId: task.id,
      agentName: r.name,
      toolName: "workbench.openPR",
      // One stable branch per routine → one PR that updates each run, instead
      // of a fresh PR per commit piling up.
      input: {
        taskId,
        title,
        body,
        prBranch: `aios/routine-${r.id}`,
        routineId: r.id,
      },
    })
    .returning();
  await sql.notify("approvals_changed", row.id);
  const { notify } = await import("@/core/notify");
  await notify({
    title: `PR ready for approval: ${r.name}`,
    body: `The routine's change passed verification. Approve to push the branch and open the PR.`,
    level: "warn",
    source: `routine:${r.name}`,
    href: "/m/today",
  });
  log(`queued PR approval for task ${taskId.slice(0, 8)} (routine ${r.name})`);
}

/** Latest task a routine spawned — for the PR title/body context. */
export async function latestRoutineTask(routineId: string) {
  const [t] = await db
    .select()
    .from(workbenchTasks)
    .where(eq(workbenchTasks.createdFrom, `routines:${routineId}`))
    .orderBy(desc(workbenchTasks.createdAt))
    .limit(1);
  return t ?? null;
}

export const routineJobs: ModuleJob[] = [
  {
    // NOTIFY-driven "run now" for a routine.
    channel: "routines_run",
    handle: async (payload) => {
      if (payload) await fireRoutine(payload);
    },
  },
  {
    // Commit-trigger sweep. Idempotent via lastSeenSha, so re-running is safe.
    channel: "routines_commit_sweep",
    schedule: "*/5 * * * *",
    handle: async () => {
      await checkCommitTriggers();
    },
  },
];
