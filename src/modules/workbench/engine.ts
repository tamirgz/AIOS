/**
 * Workbench engine — runs inside the worker.
 *
 * Responsibilities the adapters must never own: claiming an attempt exactly
 * once, git isolation, wall-clock timeouts, process-group kills, and
 * reconciling attempts that a worker restart left running. Adapters only
 * translate their executor's output into normalized events.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { and, asc, eq, inArray, sql as dsql } from "drizzle-orm";
import { db, sql } from "@/core/db/client";
import type { ModuleJob } from "@/core/modules/types.server";
import { claudeHeadlessAdapter } from "./adapters/claude-headless";
import { codexHeadlessAdapter } from "./adapters/codex-headless";
import {
  AIOS_OPENCODE_CONFIG,
  AIOS_OPENCODE_DIR,
  cliAdapter,
  type CliParser,
} from "./adapters/cli";
import { TIMEOUTS } from "./defaults";
import { assertFreeModel } from "./models";
import { nativeAdapter } from "./adapters/native";
import type { Adapter, AdapterEvent } from "./adapters/types";
import {
  commitCheckpoint,
  createClone,
  createWorktree,
  fetchBranchFromClone,
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
  "codex-headless": codexHeadlessAdapter,
  native: nativeAdapter,
  cli: cliAdapter,
};

const log = (m: string) =>
  console.log(`[workbench ${new Date().toISOString()}] ${m}`);

/**
 * AIOS keeps its own opencode config rather than editing the user's: theirs
 * carries personal MCP servers and credentials, and a headless run must not
 * depend on those being reachable. `OPENCODE_CONFIG` points opencode here.
 *
 * The Ollama provider block below is the verified shape from opencode's own
 * published schema (ProviderConfig: npm + options.baseURL + models).
 */
async function writeOpencodeConfig(workdir: string): Promise<void> {
  const models: Record<string, { name: string }> = {};
  try {
    const res = await fetch("http://localhost:11434/api/tags", {
      signal: AbortSignal.timeout(4000),
    });
    const data = (await res.json()) as { models?: { name: string }[] };
    for (const m of data.models ?? []) models[m.name] = { name: m.name };
  } catch {
    // Ollama down — seed the coder models so the config is still valid.
    models["qwen3-coder:30b"] = { name: "qwen3-coder:30b" };
    models["qwen2.5-coder:7b"] = { name: "qwen2.5-coder:7b" };
  }

  await mkdir(AIOS_OPENCODE_DIR, { recursive: true });
  await writeFile(
    AIOS_OPENCODE_CONFIG,
    JSON.stringify(
      {
        $schema: "https://opencode.ai/config.json",
        // Turn off the user's global MCP servers for AIOS runs: a headless run
        // must not block on a slow local `mgrep mcp` sync or a remote MCP
        // handshake during init. AIOS's config merges over the global one, so
        // these disables win.
        mcp: {
          mgrep: { type: "local", command: ["mgrep", "mcp"], enabled: false },
          "n8n-mcp": {
            type: "remote",
            url: "https://n8ntg.vps.webdock.cloud/n8n-mcp/mcp",
            enabled: false,
          },
        },
        provider: {
          ollama: {
            npm: "@ai-sdk/openai-compatible",
            name: "Ollama (local)",
            // Host-run agents talk to Ollama on localhost; only containers
            // need host.docker.internal.
            options: { baseURL: "http://localhost:11434/v1", apiKey: "ollama" },
            models,
          },
        },
        // Unattended runs can't answer prompts. Edits are safe because the
        // engine confines every attempt to a throwaway git worktree.
        permission: {
          read: "allow",
          edit: "allow",
          glob: "allow",
          grep: "allow",
          list: "allow",
          bash: "allow",
          // A linked worktree's .git is a *file* pointing at the main repo, so
          // opencode resolves the project root there and treats the worktree
          // itself as external — which silently blocked every write. Allow
          // exactly this attempt's directory, and nothing else: a local model
          // that invents "/world.txt" (observed) still gets stopped.
          external_directory: {
            [`${workdir}/**`]: "allow",
            [workdir]: "allow",
            "*": "deny",
          },
        },
      },
      null,
      2,
    ),
    "utf8",
  );
}

/** Seeded once so Settings has rows to edit and the engine has defaults. */
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
        // GPT-5 via a ChatGPT Pro subscription (no API key) — the second
        // "hard task" brain alongside Claude. Auth: `codex login`.
        id: "codex-headless",
        name: "Codex (GPT-5, ChatGPT sub)",
        kind: "codex-headless" as const,
        defaultModel: "gpt-5.6-sol",
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
      // ── W2: local coding agents, as configuration rather than code ──────
      {
        id: "opencode",
        name: "opencode (local + free cloud)",
        kind: "cli" as const,
        // {{model}} carries the full provider/model spec (ollama/…, opencode/…,
        // nvidia/…) so any free model in opencode's library works, not just
        // local. --dangerously-skip-permissions auto-approves anything not
        // *explicitly* denied, so the external_directory deny rule still holds;
        // without it a headless "write" falls through to "ask" and is dropped.
        commandTemplate:
          "opencode run --format json --dangerously-skip-permissions --model {{model}} {{prompt}}",
        parser: "jsonl" as const,
        defaultModel: "ollama/qwen3.5:35b-a3b-coding-nvfp4",
        gitMode: "worktree" as const,
        timeoutMs: TIMEOUTS["code-local"],
      },
      {
        id: "pi",
        name: "pi + local model",
        kind: "cli" as const,
        commandTemplate:
          "pi --provider ollama --model {{model}} --mode json -p {{prompt}}",
        parser: "pi-json" as const,
        defaultModel: "qwen2.5-coder:7b",
        gitMode: "worktree" as const,
        timeoutMs: TIMEOUTS["code-local"],
      },
      {
        id: "aider",
        name: "aider + local model",
        kind: "cli" as const,
        // aider has no structured output, but it auto-commits every edit —
        // which the worktree diff picks up regardless of what it printed.
        commandTemplate:
          "aider --yes --no-stream --model ollama_chat/{{model}} --message {{prompt}}",
        parser: "text" as const,
        defaultModel: "qwen3-coder:30b",
        gitMode: "worktree" as const,
        timeoutMs: TIMEOUTS["code-local"],
      },
    ])
    .onConflictDoNothing();

  // Migrate an opencode row seeded before full-spec models: the old template
  // hardcoded `ollama/{{model}}` and stored a bare tag, which can't reach the
  // free cloud models. onConflictDoNothing above never touches an existing
  // row, so fix it explicitly and idempotently.
  await db
    .update(executors)
    .set({
      name: "opencode (local + free cloud)",
      commandTemplate:
        "opencode run --format json --dangerously-skip-permissions --model {{model}} {{prompt}}",
      defaultModel: "ollama/qwen3.5:35b-a3b-coding-nvfp4",
    })
    .where(
      and(
        eq(executors.id, "opencode"),
        dsql`${executors.commandTemplate} like '%--model ollama/{{model}}%'`,
      ),
    );
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
    // A CLI agent needs the workdir to BE the git root (a local clone), or it
    // resolves its project to the main repo through the worktree link and edits
    // the wrong tree. In-process executors (claude-headless) handle a linked
    // worktree fine, and it's cheaper, so they keep using one.
    let workdir: string;
    let branch: string | null = null;
    let baseSha: string | null = null;
    let isClone = false;
    if (executor?.gitMode === "worktree" && task.repoPath) {
      if (!(await isGitRepo(task.repoPath))) {
        throw new Error(`${task.repoPath} is not a git repository`);
      }
      isClone = executor.kind === "cli";
      const iso = isClone
        ? await createClone(task.repoPath, attempt.id)
        : await createWorktree(task.repoPath, attempt.id);
      workdir = iso.workdir;
      branch = iso.branch;
      baseSha = iso.baseSha;
      await emitEvent(attempt.id, {
        type: "status",
        payload: { phase: isClone ? "clone" : "worktree", branch, workdir },
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
    // A CLI executor is driven entirely by its row: template, parser, and —
    // for opencode — the config file AIOS manages instead of the user's.
    if (executor?.kind === "cli") {
      // Free-only guarantee: a local executor may use any model from its
      // library so long as it's free. Refuse a metered spec here rather than
      // let it reach a paid API. The model was already resolved above.
      assertFreeModel(attempt.model ?? executor.defaultModel ?? null);
      await writeOpencodeConfig(workdir);
    }

    // Local models need autonomy spelled out — Claude infers it. But do NOT
    // hand them the absolute workdir path: given a clone whose project root is
    // already correct, opencode surfaces the right paths itself, and a path
    // hint just gets mangled (observed: the model turned the workdir into a
    // bogus out-of-project path and got blocked). Keep the preamble about
    // *behaviour*, not *location*.
    const prompt =
      executor?.kind === "cli"
        ? [
            "You are running unattended in this project directory. Read and edit files here directly, using the paths the tools give you.",
            "Do not ask questions, do not offer alternatives, do not stop to confirm — make the edits yourself, then stop.",
            `Today is ${new Date().toISOString().slice(0, 10)}.`,
            "",
            "TASK:",
            task.prompt,
          ].join("\n")
        : task.prompt;

    const result = await adapter.run(
      {
        attemptId: attempt.id,
        prompt,
        workdir,
        model: attempt.model ?? executor?.defaultModel ?? null,
        timeoutMs,
        taskType: task.taskType,
        signal: controller.signal,
        commandTemplate: executor?.commandTemplate ?? undefined,
        parser: (executor?.parser as CliParser | null) ?? undefined,
        env: {
          OPENCODE_CONFIG: AIOS_OPENCODE_CONFIG,
          OPENCODE_DISABLE_AUTOUPDATE: "1",
          // Read the model DB from the local cache instead of fetching it from
          // models.dev at init — a blocking network call that intermittently
          // stalled startup. The provider SDK is pre-installed too, so opencode
          // never does an on-init `bun install` (the actual cause of the hang).
          OPENCODE_MODELS_PATH: join(
            homedir(),
            ".cache",
            "opencode",
            "models.json",
          ),
          OPENCODE_DISABLE_SHARE: "1",
          OLLAMA_HOST: "127.0.0.1:11434",
        },
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
      // A clone's branch lives in the clone; bring it into the user's repo so
      // review and merge are identical to the worktree path. The diff is then
      // read from the clone (still present), which has base..HEAD.
      if (isClone && task.repoPath) {
        await fetchBranchFromClone(task.repoPath, workdir, branch);
      }
      const diff = await diffSince(workdir, baseSha);
      changedFiles = diff.files.length;
      await emitEvent(attempt.id, {
        type: "status",
        payload: { phase: "diff", files: diff.files },
      });
    }

    const timedOut = controller.signal.aborted;
    // A repo task that changed nothing is a no-op, not a success: a local
    // model was observed announcing "written successfully" while the file
    // never appeared on disk. Calling that "done" would be a lie on the card.
    const noOp = !timedOut && result.ok && branch !== null && changedFiles === 0;
    const status = timedOut
      ? "timed_out"
      : result.ok && !noOp
        ? "succeeded"
        : "failed";
    const noOpError =
      "finished without changing any files — the executor reported success but the worktree is untouched";

    await db
      .update(taskAttempts)
      .set({
        status,
        result: result.result?.slice(0, 8000) ?? null,
        error: (noOp ? noOpError : result.error)?.slice(0, 2000) ?? null,
        exitCode: result.exitCode ?? null,
        inputTokens: result.inputTokens ?? null,
        outputTokens: result.outputTokens ?? null,
        costUsd: result.costUsd != null ? String(result.costUsd) : null,
        // Record the model the executor actually ran, if it reported one and the
        // attempt didn't already pin it (claude-headless resolves it itself).
        ...(result.model && !attempt.model ? { model: result.model } : {}),
        endedAt: new Date(),
      })
      .where(eq(taskAttempts.id, attempt.id));

    await setTask(task.id, {
      status:
        status !== "succeeded" ? "failed" : changedFiles > 0 ? "review" : "done",
      summary: noOp
        ? `No files changed. The executor's last words: ${(result.result ?? "(nothing)").slice(0, 600)}`
        : (result.result ?? result.error ?? "").slice(0, 1000) || null,
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
  {
    // "Verify free models" from Settings: live-probe the free cloud catalog
    // ($0 calls) and prune what's retired/broken. Idempotent via the health
    // ledger — a `force` payload re-checks everything.
    channel: "verify_free_models",
    handle: async (payload) => {
      const { verifyFreeModels } = await import("./models");
      const s = await verifyFreeModels({ force: payload === "force" });
      log(
        `free-model verify: ${s.ok} ok, ${s.gone} retired, ${s.error} failing, ${s.unknown} unchecked (of ${s.total})`,
      );
      await notifyChanged("free_models");
    },
  },
];
