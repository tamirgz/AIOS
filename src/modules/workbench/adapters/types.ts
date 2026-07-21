import type { AttemptEventType } from "../schema";

/** What an adapter emits — normalized, identical for every executor. */
export interface AdapterEvent {
  type: AttemptEventType;
  payload: Record<string, unknown>;
}

export interface AdapterContext {
  attemptId: string;
  prompt: string;
  /** Directory the executor runs in (git worktree, or a scratch dir). */
  workdir: string;
  model: string | null;
  timeoutMs: number;
  taskType: string;
  /** Cooperative cancel — the engine aborts on timeout and on user cancel. */
  signal: AbortSignal;
  /** Called as soon as a child process exists, so the engine can record it. */
  onPid?: (pid: number) => void;
}

export interface AdapterResult {
  ok: boolean;
  /** The executor's final message — becomes the task headline. */
  result?: string;
  error?: string;
  exitCode?: number;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
}

export interface Adapter {
  id: string;
  run(
    ctx: AdapterContext,
    emit: (e: AdapterEvent) => Promise<void>,
  ): Promise<AdapterResult>;
}
