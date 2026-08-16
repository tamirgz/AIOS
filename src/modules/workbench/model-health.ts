// Free-model health: the availability signal opencode's price DB lacks.
//
// The cached model catalog (`~/.cache/opencode/models.json`) lists price but
// carries NO liveness field — no EOL, deprecated, or status. So it happily
// offers models the provider has since retired (instant HTTP 410) or that
// error out, and the only way to know is to actually call one. This module is
// that knowledge: a small ledger of what we've learned, written whenever a run
// (or a probe) touches a model, and read to prune the pickers.
//
// No `server-only`: reached by the worker under plain tsx, like the rest of
// the module's server code.
import { spawn } from "node:child_process";
import {
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { harnessEnv } from "./adapters/sandbox";
import {
  AIOS_OPENCODE_CONFIG,
  AIOS_OPENCODE_DIR,
  childPath,
  resolveBin,
} from "./adapters/opencode-env";

export type HealthStatus = "ok" | "gone" | "error";
export interface ModelHealth {
  status: HealthStatus;
  detail?: string;
  checkedAt: string; // ISO
}
export type HealthLedger = Record<string, ModelHealth>;

const LEDGER_PATH = join(homedir(), ".aios", "free-model-health.json");

/** A model marked `error` is hidden this long, then allowed to be retried. */
export const ERROR_COOLDOWN_MS = 6 * 60 * 60 * 1000;
/** A ledger entry older than this is re-probed by a verify pass (idempotency). */
export const STALE_MS = 12 * 60 * 60 * 1000;

/** Known-to-work free models, verified by hand — the fallback we suggest. */
export const KNOWN_GOOD_FREE = [
  "nvidia/meta/llama-3.3-70b-instruct",
  "nvidia/nvidia/llama-3.3-nemotron-super-49b-v1.5",
];

/** Cloud = has a provider prefix and isn't local Ollama; only these go 410. */
function isCloudModel(model: string): boolean {
  const slash = model.indexOf("/");
  if (slash === -1) return false;
  return model.slice(0, slash).toLowerCase() !== "ollama";
}

export function readHealthLedger(): HealthLedger {
  try {
    return JSON.parse(readFileSync(LEDGER_PATH, "utf8")) as HealthLedger;
  } catch {
    return {};
  }
}

function writeHealthLedger(ledger: HealthLedger): void {
  try {
    mkdirSync(dirname(LEDGER_PATH), { recursive: true });
    const tmp = `${LEDGER_PATH}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(ledger, null, 2), "utf8");
    renameSync(tmp, LEDGER_PATH); // atomic swap — a concurrent reader never sees half a file
  } catch {
    // A ledger we can't persist just means no memory of this outcome — never
    // fatal to the run that's recording it.
  }
}

/** Remember what a model did. Read-merge-write so concurrent runs don't clobber. */
export function recordModelHealth(
  model: string | null | undefined,
  status: HealthStatus,
  detail?: string,
): void {
  if (!model || !isCloudModel(model)) return; // local models can't 410
  const ledger = readHealthLedger();
  ledger[model] = {
    status,
    ...(detail ? { detail: detail.replace(/\s+/g, " ").trim().slice(0, 300) } : {}),
    checkedAt: new Date().toISOString(),
  };
  writeHealthLedger(ledger);
}

/** Batch update — one atomic write for a whole verify pass, no lost updates. */
export function recordModelHealthBatch(
  entries: Array<{ model: string; status: HealthStatus; detail?: string }>,
): void {
  const ledger = readHealthLedger();
  const at = new Date().toISOString();
  for (const e of entries) {
    if (!isCloudModel(e.model)) continue;
    ledger[e.model] = {
      status: e.status,
      ...(e.detail
        ? { detail: e.detail.replace(/\s+/g, " ").trim().slice(0, 300) }
        : {}),
      checkedAt: at,
    };
  }
  writeHealthLedger(ledger);
}

export interface FreeModelHealthSummary {
  total: number;
  ok: number;
  gone: number;
  error: number;
  unknown: number;
  at: string; // ISO of the summary
}

/** Tally the ledger against a candidate list (what the pickers would offer). */
export function summarizeHealth(
  candidates: string[],
  ledger: HealthLedger = readHealthLedger(),
): FreeModelHealthSummary {
  let ok = 0,
    gone = 0,
    error = 0,
    unknown = 0;
  for (const m of candidates) {
    const s = ledger[m]?.status;
    if (s === "ok") ok++;
    else if (s === "gone") gone++;
    else if (s === "error") error++;
    else unknown++;
  }
  return { total: candidates.length, ok, gone, error, unknown, at: new Date().toISOString() };
}

/**
 * Read a failed opencode run's output and decide whether the *model* is the
 * problem (not the task). `null` = not a model-availability failure, leave the
 * ledger alone.
 */
export function classifyModelFailure(
  output: string,
): { status: HealthStatus; detail: string } | null {
  const o = output.toLowerCase();
  const firstMatch = (re: RegExp) =>
    output.split("\n").find((l) => re.test(l))?.trim().slice(0, 200) ?? "";
  if (
    /end of life|no longer available|"status":\s*410|"title":"gone"|reached its end/.test(
      o,
    )
  ) {
    return { status: "gone", detail: firstMatch(/end of life|no longer available|gone|410/i) || "retired by provider" };
  }
  if (
    /unknownerror|unexpected server error|"status":\s*5\d\d|internal server error|service unavailable|bad gateway/.test(
      o,
    )
  ) {
    return { status: "error", detail: firstMatch(/unknownerror|server error|5\d\d|unavailable/i) || "server error" };
  }
  return null;
}

/** Is this free model usable right now, per the ledger? */
export function isModelUsable(
  model: string,
  ledger: HealthLedger,
  now = Date.now(),
): boolean {
  const h = ledger[model];
  if (!h) return true; // never seen → optimistic
  if (h.status === "ok") return true;
  if (h.status === "gone") return false; // permanent
  return now - Date.parse(h.checkedAt) > ERROR_COOLDOWN_MS; // error → cooldown then retry
}

/** Drop models the ledger knows are dead/broken. Local models always pass. */
export function filterUsableModels(
  models: string[],
  ledger: HealthLedger = readHealthLedger(),
): string[] {
  const now = Date.now();
  return models.filter((m) => !isCloudModel(m) || isModelUsable(m, ledger, now));
}

/** Free models to recommend when the user's pick is dead — ledger 'ok' first. */
export function suggestFreeModels(ledger: HealthLedger = readHealthLedger()): string[] {
  const ok = Object.entries(ledger)
    .filter(([, h]) => h.status === "ok")
    .map(([m]) => m);
  const pool = ok.length ? ok : KNOWN_GOOD_FREE;
  return pool.slice(0, 4);
}

/**
 * One cheap $0 probe of a cloud free model through opencode — a one-word
 * prompt, tightly timed. Classifies the outcome without touching the ledger
 * (the caller records it), so a verify pass controls its own write batching.
 */
/**
 * A probe can be inconclusive: a slow cold start looks like a timeout but the
 * model is fine. `unknown` means "learned nothing" — never hide a model for it.
 */
export type ProbeStatus = HealthStatus | "unknown";

export function probeFreeModel(
  model: string,
  timeoutMs = 60_000,
): Promise<{ status: ProbeStatus; detail?: string }> {
  return new Promise((resolve) => {
    let bin: string;
    try {
      bin = resolveBin("opencode");
    } catch {
      resolve({ status: "error", detail: "opencode not found" });
      return;
    }
    const child = spawn(
      bin,
      ["run", "--format", "json", "--model", model, "Reply with exactly: OK"],
      {
        cwd: AIOS_OPENCODE_DIR,
        detached: true,
        stdio: ["ignore", "pipe", "pipe"],
        // Same isolated, subscription-safe env as a real cli run.
        env: harnessEnv("cli", {
          PATH: childPath(),
          OPENCODE_CONFIG: AIOS_OPENCODE_CONFIG,
          PWD: AIOS_OPENCODE_DIR,
          CI: "1",
        }),
      },
    );
    let out = "";
    const grab = (c: string) => {
      out += c;
      if (out.length > 8000) out = out.slice(-8000);
    };
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", grab);
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", grab);

    let settled = false;
    const done = (r: { status: ProbeStatus; detail?: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(r);
    };
    const timer = setTimeout(() => {
      if (child.pid) {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {
          // already gone
        }
      }
      // Slow ≠ dead: a cold start can outlast the timeout. Learn nothing rather
      // than wrongly hiding a working model.
      done({ status: "unknown", detail: "probe timeout" });
    }, timeoutMs);

    child.on("error", (e) => done({ status: "error", detail: e.message }));
    child.on("close", (code) => {
      const fail = classifyModelFailure(out);
      if (fail) return done(fail);
      if (code === 0 && !/"type"\s*:\s*"error"/.test(out)) {
        return done({ status: "ok" });
      }
      // Non-zero exit with no recognizable error signature — inconclusive.
      done({ status: "unknown", detail: `exit ${code}` });
    });
  });
}
