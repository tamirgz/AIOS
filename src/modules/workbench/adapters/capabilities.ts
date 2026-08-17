// Leaf module: "can this executor actually run on THIS host?" — pure + sync, no
// DB, no adapter imports (kept cycle-free like opencode-env, which it reuses).
//
// The CLI executors (claude-headless, codex-headless, opencode/pi) shell out to
// host binaries and, on macOS, a seatbelt + the user's real CLI config. Inside a
// Linux container none of that exists, so those executors must be DISABLED, not
// attempted — the container must never reach for host CLI auth. `native` and the
// `research` task type need no binary and are always available.
import { existsSync } from "node:fs";
import { resolveBin } from "./opencode-env";

function hasBin(cmd: string): boolean {
  if (cmd.includes("/")) return existsSync(cmd);
  // resolveBin returns a full path only when it finds the binary in a known
  // install dir, otherwise the bare command back.
  const resolved = resolveBin(cmd);
  return resolved !== cmd && existsSync(resolved);
}

function claudeBinPresent(): boolean {
  const override = process.env.WORKBENCH_CLAUDE_BIN?.trim();
  if (override) return existsSync(override);
  return hasBin("claude");
}

/** First word of a command template, e.g. "opencode run …" → "opencode". */
function templateBin(commandTemplate?: string | null): string | null {
  const first = (commandTemplate ?? "").trim().split(/\s+/)[0];
  return first || null;
}

export interface Availability {
  ok: boolean;
  reason?: string;
}

/**
 * Whether an executor of this `kind` can run here. `research` tasks use an
 * HTTP-only adapter regardless of kind, so they're always available.
 */
export function executorAvailability(
  kind: string,
  opts?: { commandTemplate?: string | null; taskType?: string },
): Availability {
  if (opts?.taskType === "research") return { ok: true };
  const missing = (bin: string): Availability => ({
    ok: false,
    reason: `the \`${bin}\` CLI isn't installed on this host (needs the native install)`,
  });
  switch (kind) {
    case "native":
      return { ok: true };
    case "claude-headless":
      return claudeBinPresent() ? { ok: true } : missing("claude");
    case "codex-headless":
      return hasBin("codex") ? { ok: true } : missing("codex");
    case "cli": {
      const bin = templateBin(opts?.commandTemplate);
      if (!bin) return { ok: false, reason: "no command configured" };
      return hasBin(bin) ? { ok: true } : missing(bin);
    }
    default:
      return { ok: true };
  }
}
