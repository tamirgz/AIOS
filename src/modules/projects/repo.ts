// Code grounding: keep a read-only clone of a project's repo so agents can read
// the real code. EVERY attached repo — remote GitHub URL *and* local folder —
// is copied to ~/.aios/repos/<projectId>, and AIOS only ever reads/operates on
// that copy. A local folder is copied with `git clone --no-hardlinks --local`
// (a fully independent object store), so AIOS can never write your original
// repo or its origin: the source is only ever read (clone/fetch), never pushed.
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

/**
 * The directory an agent should read for this project, or null. Always the
 * read-only cache copy (never the user's original) — both remote and local
 * repos are copied there by syncProjectRepo.
 */
export function usableRepoPath(
  projectId: string,
  repoUrl: string | null,
): string | null {
  if (!repoUrl?.trim()) return null;
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

  const local = isLocalPath(ref);
  const source = local ? expandHome(ref) : ref;
  if (local && !existsSync(join(source, ".git"))) {
    return { ok: false, detail: `local path is not a git repo: ${source}` };
  }

  const dir = projectRepoDir(projectId);
  try {
    if (existsSync(join(dir, ".git"))) {
      // Read-only mirror: pull the source's committed state into our copy.
      // `fetch` only READS the source; we never push, so the original is safe.
      await exec("git", ["-C", dir, "fetch", "origin"], {
        env: GIT_ENV,
        maxBuffer: 64 * 1024 * 1024,
      });
      await exec("git", ["-C", dir, "reset", "--hard", "@{u}"], { env: GIT_ENV });
      return { ok: true, path: dir, detail: "updated" };
    }
    await mkdir(REPOS_ROOT, { recursive: true });
    // --no-hardlinks --local for a local source = a fully independent copy, so
    // nothing AIOS does to the copy can ever reach the user's original repo.
    const cloneArgs = local
      ? ["clone", "--no-hardlinks", "--local", source, dir]
      : ["clone", source, dir];
    await exec("git", cloneArgs, { env: GIT_ENV, maxBuffer: 64 * 1024 * 1024 });
    return { ok: true, path: dir, detail: local ? "copied (read-only)" : "cloned" };
  } catch (e) {
    const msg = (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " ");
    return { ok: false, detail: msg.slice(0, 300) };
  }
}
