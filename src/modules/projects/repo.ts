// Code grounding: keep a read-only clone of a project's repo so agents can read
// the real code. Remote (GitHub) URLs are cloned to ~/.aios/repos/<projectId>;
// a local absolute path is used in place (nothing to clone).
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
export const REPOS_ROOT = join(homedir(), ".aios", "repos");

// Never let git block on a credential prompt in the non-interactive worker.
const GIT_ENV = { ...process.env, GIT_TERMINAL_PROMPT: "0" };

export function projectRepoDir(projectId: string): string {
  return join(REPOS_ROOT, projectId);
}

/** A git remote vs. a local absolute path. */
export function isLocalPath(ref: string): boolean {
  return ref.startsWith("/") || ref.startsWith("~");
}

function expandHome(p: string): string {
  return p.startsWith("~") ? join(homedir(), p.slice(1)) : p;
}

/** The directory an agent should actually read for this project, or null. */
export function usableRepoPath(
  projectId: string,
  repoUrl: string | null,
): string | null {
  const ref = repoUrl?.trim();
  if (!ref) return null;
  if (isLocalPath(ref)) {
    const p = expandHome(ref);
    return existsSync(join(p, ".git")) ? p : null;
  }
  const dir = projectRepoDir(projectId);
  return existsSync(join(dir, ".git")) ? dir : null;
}

export interface RepoSyncResult {
  ok: boolean;
  path?: string;
  detail: string;
}

/**
 * Clone (first time) or fast-forward the project's read-only cache clone.
 * A local-path repo is validated and used in place. Public remotes work as-is;
 * a private remote fails cleanly (no prompt) — it needs a token in the URL.
 */
export async function syncProjectRepo(
  projectId: string,
  repoUrl: string,
): Promise<RepoSyncResult> {
  const ref = repoUrl.trim();
  if (!ref) return { ok: false, detail: "no repo url" };

  if (isLocalPath(ref)) {
    const p = expandHome(ref);
    return existsSync(join(p, ".git"))
      ? { ok: true, path: p, detail: "local repo (read in place)" }
      : { ok: false, detail: `local path is not a git repo: ${p}` };
  }

  const dir = projectRepoDir(projectId);
  try {
    if (existsSync(join(dir, ".git"))) {
      await exec("git", ["-C", dir, "fetch", "origin"], {
        env: GIT_ENV,
        maxBuffer: 64 * 1024 * 1024,
      });
      // Read-only mirror: hard-reset onto the tracked remote branch.
      await exec("git", ["-C", dir, "reset", "--hard", "@{u}"], { env: GIT_ENV });
      return { ok: true, path: dir, detail: "updated" };
    }
    await mkdir(REPOS_ROOT, { recursive: true });
    await exec("git", ["clone", ref, dir], {
      env: GIT_ENV,
      maxBuffer: 64 * 1024 * 1024,
    });
    return { ok: true, path: dir, detail: "cloned" };
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ");
    // Surface the actionable bit (auth/not-found) rather than the whole trace.
    return { ok: false, detail: msg.slice(0, 300) };
  }
}
