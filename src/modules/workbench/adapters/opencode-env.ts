// Leaf module: opencode/CLI path + config location, shared by the cli adapter
// and the free-model health prober. Kept dependency-free so importing it can
// never form an init-order cycle (this module's history has bitten us before).
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * launchd hands the worker a minimal PATH, so agent binaries installed in a
 * user prefix are invisible to it. Resolve the executable ourselves and give
 * children a PATH that includes the usual install locations.
 */
const BIN_DIRS = [
  join(homedir(), ".opencode", "bin"),
  join(homedir(), ".local", "bin"),
  "/opt/homebrew/bin",
  "/usr/local/bin",
  "/usr/bin",
];

export function resolveBin(cmd: string): string {
  if (cmd.includes("/")) return cmd;
  for (const dir of BIN_DIRS) {
    const p = join(dir, cmd);
    if (existsSync(p)) return p;
  }
  return cmd;
}

export function childPath(): string {
  return [...BIN_DIRS, process.env.PATH ?? ""].filter(Boolean).join(":");
}

/** Where AIOS keeps the opencode config it manages (never the user's own). */
export const AIOS_OPENCODE_CONFIG = join(
  homedir(),
  ".aios",
  "opencode",
  "opencode.json",
);
export const AIOS_OPENCODE_DIR = join(homedir(), ".aios", "opencode");
