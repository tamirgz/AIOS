/**
 * Lifecycle for the Apple-MLX server so it isn't resident when idle.
 *
 * `mlx_lm.server` has no Ollama-style keep_alive — it holds the loaded model in
 * RAM until a different one is requested. For AIOS's ask/chat model that's ~17GB
 * sitting there even when nobody is asking. So AIOS drives the process itself
 * (via its launchd agent `com.aios.mlx`, configured RunAtLoad=false /
 * KeepAlive=false so it neither auto-starts nor fights us):
 *
 *   • preload — the Ask / ⌘K inputs call startMlx() on focus, so the model is
 *     already loading by the time a question is submitted;
 *   • ensure  — a real request awaits ensureMlxUp() so it never hits a cold server;
 *   • unload  — ~60s after the last request finishes (and only when nothing is
 *     in flight) AIOS stops the process, freeing its RAM until next time.
 *
 * All process control is `launchctl` on the agent; every call is best-effort.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);
const LABEL = "com.aios.mlx";
const IDLE_MS = 60_000;

export async function mlxBase(): Promise<string> {
  const { getSetting } = await import("@/core/app-settings");
  const fromSetting = (await getSetting("mlx_base_url").catch(() => null))?.trim();
  const base = fromSetting || process.env.MLX_BASE_URL || "http://localhost:8080/v1";
  return base.replace(/\/$/, "");
}

function target(): string {
  return `gui/${process.getuid?.() ?? 501}/${LABEL}`;
}

async function serverUp(): Promise<boolean> {
  try {
    const base = await mlxBase();
    const r = await fetch(`${base}/models`, { signal: AbortSignal.timeout(2000) });
    return r.ok;
  } catch {
    return false;
  }
}

/** Kick the model load without waiting — used by the preload-on-typing path. */
export async function startMlx(): Promise<void> {
  if (await serverUp()) return;
  await exec("launchctl", ["kickstart", target()]).catch(() => {});
}

/** Guarantee the server is serving before a real request (waits out a cold load). */
export async function ensureMlxUp(): Promise<void> {
  if (await serverUp()) return;
  await exec("launchctl", ["kickstart", target()]).catch(() => {});
  for (let i = 0; i < 90; i++) {
    // ~180s ceiling — a big MoE loads in seconds-to-a-minute from the HF cache.
    if (await serverUp()) return;
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error("mlx_lm.server did not become ready");
}

async function killMlx(): Promise<void> {
  await exec("launchctl", ["kill", "TERM", target()]).catch(() => {});
}

// ── Idle-unload bookkeeping (per server process) ─────────────────────────────
let inFlight = 0;
let lastUsed = 0;
let unloadTimer: ReturnType<typeof setTimeout> | null = null;

function armUnload(): void {
  if (unloadTimer) clearTimeout(unloadTimer);
  unloadTimer = setTimeout(reap, IDLE_MS + 1000);
  unloadTimer.unref?.();
}

function reap(): void {
  // Never unload mid-request, and re-arm if a request touched us recently.
  if (inFlight > 0 || Date.now() - lastUsed < IDLE_MS) {
    armUnload();
    return;
  }
  void killMlx();
}

/** Mark a request started — disarms the unload timer while work is in flight. */
export function beginMlxRequest(): void {
  inFlight += 1;
  lastUsed = Date.now();
  if (unloadTimer) {
    clearTimeout(unloadTimer);
    unloadTimer = null;
  }
}

/** Mark a request finished — arms the idle-unload countdown. */
export function endMlxRequest(): void {
  inFlight = Math.max(0, inFlight - 1);
  lastUsed = Date.now();
  armUnload();
}
