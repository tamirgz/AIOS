/**
 * Git isolation for attempts. The engine owns the worktree lifecycle — an
 * adapter only ever receives a directory to work in, so a badly-behaved
 * executor can't strand a branch or dirty the user's checkout.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { mkdir, rm } from "node:fs/promises";

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
 * Isolation for a CLI executor — a local clone, NOT a linked worktree.
 *
 * A linked worktree's `.git` is a *file* pointing back at the main repo, so
 * external CLI agents (opencode, aider…) resolve their "project root" to the
 * main repo and load ITS context/permissions — the model ends up editing the
 * wrong tree entirely. Measured: the same opencode+model that fails in a
 * worktree of a repo succeeds in a standalone clone of it. A clone has a real
 * `.git` directory, so the workdir IS the project root, unambiguously.
 *
 * `git clone --local` hardlinks the object store, so this is near-instant and
 * cheap even for large repos. The new branch is created in the clone; the
 * engine fetches it back into the main repo at settle time so review and
 * merge work exactly as they do for worktree executors.
 */
export async function createClone(
  repoPath: string,
  attemptId: string,
): Promise<Worktree> {
  await mkdir(WORKTREE_ROOT, { recursive: true });
  const short = attemptId.slice(0, 8);
  const branch = `aios/task-${short}`;
  const workdir = join(WORKTREE_ROOT, `clone-${short}`);
  const baseSha = (await git(repoPath, ["rev-parse", "HEAD"])).trim();
  await git(repoPath, ["clone", "--local", "--no-hardlinks", repoPath, workdir]);
  // Detach-free branch off the exact base commit, so the diff is base..HEAD.
  await git(workdir, ["checkout", "-b", branch, baseSha]);
  return { workdir, branch, baseSha };
}

/**
 * Pull a clone's finished branch back into the main repo, so the review diff
 * and the manual merge happen against the user's real repository — identical
 * to the worktree path. No-op if the branch never got any commits.
 */
export async function fetchBranchFromClone(
  repoPath: string,
  clonePath: string,
  branch: string,
): Promise<void> {
  await git(repoPath, [
    "fetch",
    "--no-tags",
    clonePath,
    `${branch}:${branch}`,
  ]).catch(() => {
    // The branch may not exist yet if the agent committed nothing — fine.
  });
}

/** Remove a clone directory. Unlike a worktree it has no main-repo registration. */
export async function removeClone(clonePath: string): Promise<void> {
  await rm(clonePath, { recursive: true, force: true }).catch(() => {});
}

/**
 * Tear down whatever isolation an attempt used. Clones live at
 * `.../clone-<id>` and are just directories; worktrees are registered with the
 * main repo and must be removed through git. The path tells them apart, so
 * callers don't have to track which kind an attempt was.
 */
export async function removeIsolation(
  repoPath: string,
  workdir: string,
): Promise<void> {
  if (basename(workdir).startsWith("clone-")) {
    await removeClone(workdir);
  } else {
    await removeWorktree(repoPath, workdir);
  }
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
  // Everything the agent touched, except our own scaffolding: `.aios/task.md`
  // is written into the worktree so a run can be reproduced by hand, and it
  // has no business showing up as a changed file in the review diff.
  await git(workdir, ["add", "-A", "--", ".", ":(exclude).aios"]);
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
  return { files, patch: truncatePatch(patch, 400_000) };
}

const PATCH_CAP = 400_000;

/**
 * Cutting at a fixed byte offset can land mid-line and leave a broken final
 * hunk (e.g. a "+"/"-" line with no newline, or a truncated hunk header),
 * which corrupts the diff for anyone parsing or applying it. Cutting at the
 * last newline before the cap keeps every line in the output complete.
 */
function truncatePatch(patch: string, cap: number = PATCH_CAP): string {
  if (patch.length <= cap) return patch;
  const cutoff = patch.lastIndexOf("\n", cap);
  const kept = cutoff === -1 ? "" : patch.slice(0, cutoff + 1);
  const omitted = patch.length - kept.length;
  return `${kept}\n[... patch truncated: ${omitted} bytes omitted ...]\n`;
}

/**
 * Delete an attempt's branch, but only when it is already merged — `-d`
 * refuses otherwise. Deleting a task should never be able to throw away work
 * you haven't taken, so an unmerged branch survives and is reported back.
 */
export async function deleteBranchIfMerged(
  repoPath: string,
  branch: string,
): Promise<boolean> {
  try {
    await git(repoPath, ["branch", "-d", branch]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Follow `origin` until it lands on a GitHub URL. AIOS works on a cache clone
 * whose origin is the user's local folder, whose own origin is GitHub — so PR
 * delivery has to hop through the chain. Returns null for a local-only repo
 * (no GitHub anywhere upstream), which is an honest "can't open a PR here".
 */
export async function resolveGithubRemote(repoPath: string): Promise<string | null> {
  let cur = repoPath;
  for (let i = 0; i < 4; i++) {
    let url: string;
    try {
      url = (await git(cur, ["remote", "get-url", "origin"])).trim();
    } catch {
      return null;
    }
    if (/github\.com/i.test(url)) return url;
    // A local-path origin: hop into it and keep looking upstream.
    if (url.startsWith("/") || url.startsWith("file:")) {
      cur = url.replace(/^file:\/\//, "");
      continue;
    }
    return null; // some non-GitHub remote — nothing to open a PR against
  }
  return null;
}

/** owner/repo from a GitHub URL (https or ssh), for `gh --repo`. */
function githubSlug(url: string): string {
  return url
    .replace(/^git@github\.com:/i, "")
    .replace(/^https?:\/\/github\.com\//i, "")
    .replace(/\.git$/i, "")
    .trim();
}

/**
 * Push an attempt's branch to GitHub and open a PR. This is the ONLY path by
 * which AIOS's work reaches the repo, and it never merges — it proposes. Called
 * exclusively through the approval queue, so the push happens only on an
 * explicit human yes.
 */
export async function openPullRequest(input: {
  repoPath: string;
  branch: string;
  title: string;
  body: string;
}): Promise<{ url: string; slug: string }> {
  const ghUrl = await resolveGithubRemote(input.repoPath);
  if (!ghUrl) {
    throw new Error(
      "no GitHub remote upstream of this repo — it's local-only, so there's nothing to open a PR against",
    );
  }
  const slug = githubSlug(ghUrl);

  // Push the branch straight to GitHub from wherever it lives (the cache clone).
  // Authenticate through gh's own credential helper for THIS push only — no
  // global git config change, no token in argv, and it works headlessly in the
  // launchd worker (osxkeychain access from a background agent is unreliable;
  // gh's token is the same auth `gh pr create` already uses successfully).
  await git(input.repoPath, [
    "-c",
    "credential.helper=",
    "-c",
    "credential.helper=!gh auth git-credential",
    "push",
    ghUrl,
    `${input.branch}:${input.branch}`,
  ]);

  // gh prints the PR URL on success. --head is the branch we just pushed; base
  // defaults to the repo's default branch. No auto-merge, ever.
  const { stdout } = await exec(
    "gh",
    [
      "pr",
      "create",
      "--repo",
      slug,
      "--head",
      input.branch,
      "--title",
      input.title,
      "--body",
      input.body,
    ],
    { cwd: input.repoPath, maxBuffer: 4 * 1024 * 1024 },
  );
  const url = stdout.trim().split("\n").filter(Boolean).pop() ?? "";
  return { url, slug };
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
