/**
 * Git isolation for attempts. The engine owns the worktree lifecycle — an
 * adapter only ever receives a directory to work in, so a badly-behaved
 * executor can't strand a branch or dirty the user's checkout.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir } from "node:fs/promises";

const exec = promisify(execFile);

export const WORKTREE_ROOT = join(homedir(), ".aios", "worktrees");
export const SCRATCH_ROOT = join(homedir(), ".aios", "scratch");

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await exec("git", args, {
    cwd,
    maxBuffer: 16 * 1024 * 1024,
  });
  return stdout;
}

export async function isGitRepo(path: string): Promise<boolean> {
  try {
    const out = await git(path, ["rev-parse", "--is-inside-work-tree"]);
    return out.trim() === "true";
  } catch {
    return false;
  }
}

export interface Worktree {
  workdir: string;
  branch: string;
  baseSha: string;
}

/** A fresh branch + worktree off the repo's current HEAD. */
export async function createWorktree(
  repoPath: string,
  attemptId: string,
): Promise<Worktree> {
  await mkdir(WORKTREE_ROOT, { recursive: true });
  const short = attemptId.slice(0, 8);
  const branch = `aios/task-${short}`;
  const workdir = join(WORKTREE_ROOT, short);
  const baseSha = (await git(repoPath, ["rev-parse", "HEAD"])).trim();
  await git(repoPath, ["worktree", "add", "-b", branch, workdir, baseSha]);
  return { workdir, branch, baseSha };
}

/**
 * Commit whatever the agent left behind. Without this a review would have to
 * read a dirty worktree, and an interrupted attempt would lose its work.
 * Returns false when the agent changed nothing.
 */
export async function commitCheckpoint(
  workdir: string,
  message: string,
): Promise<boolean> {
  await git(workdir, ["add", "-A"]);
  const staged = await git(workdir, ["diff", "--cached", "--name-only"]);
  if (!staged.trim()) return false;
  await git(workdir, [
    "-c",
    "user.name=AIOS Workbench",
    "-c",
    "user.email=workbench@aios.local",
    "commit",
    "-m",
    message,
  ]);
  return true;
}

export interface DiffFile {
  path: string;
  added: number;
  removed: number;
}

export interface DiffSummary {
  files: DiffFile[];
  patch: string;
}

/** `baseSha..HEAD` in the attempt's worktree — the review currency. */
export async function diffSince(
  workdir: string,
  baseSha: string,
): Promise<DiffSummary> {
  const numstat = await git(workdir, ["diff", "--numstat", baseSha, "HEAD"]);
  const files: DiffFile[] = numstat
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [added, removed, path] = line.split("\t");
      return {
        path,
        // "-" marks a binary file; count it as zero rather than NaN.
        added: added === "-" ? 0 : Number(added),
        removed: removed === "-" ? 0 : Number(removed),
      };
    });
  const patch = files.length
    ? await git(workdir, ["diff", baseSha, "HEAD"])
    : "";
  return { files, patch: patch.slice(0, 400_000) };
}

/** Remove the worktree; the branch stays so nothing is lost by archiving. */
export async function removeWorktree(
  repoPath: string,
  workdir: string,
): Promise<void> {
  await git(repoPath, ["worktree", "remove", "--force", workdir]).catch(
    () => {},
  );
  await git(repoPath, ["worktree", "prune"]).catch(() => {});
}
