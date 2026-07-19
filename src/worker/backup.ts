import { exec } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readdir, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";

const execAsync = promisify(exec);

const BACKUP_DIR = join(homedir(), "Backups", "aios");
const KEEP = 14;

const url =
  process.env.DATABASE_URL ?? "postgres://aios:aios@localhost:5544/aios";

/** Nightly pg_dump → gzip with simple retention. Never throws. */
export async function runBackup(
  log: (msg: string) => void,
): Promise<boolean> {
  try {
    await mkdir(BACKUP_DIR, { recursive: true });
    const stamp = new Date()
      .toISOString()
      .slice(0, 16)
      .replace(/[T:]/g, "-");
    const file = join(BACKUP_DIR, `aios-${stamp}.sql.gz`);
    await execAsync(`pg_dump "${url}" | gzip > "${file}"`, {
      timeout: 120_000,
    });
    const { size } = await stat(file);
    if (size < 1024) throw new Error(`dump suspiciously small (${size} bytes)`);
    log(`backup written: ${file} (${(size / 1024).toFixed(0)} KB)`);

    // Retention: keep the newest KEEP dumps.
    const files = (await readdir(BACKUP_DIR))
      .filter((f) => f.startsWith("aios-") && f.endsWith(".sql.gz"))
      .sort()
      .reverse();
    for (const old of files.slice(KEEP)) {
      await unlink(join(BACKUP_DIR, old));
      log(`backup pruned: ${old}`);
    }
    return true;
  } catch (e) {
    log(`BACKUP FAILED: ${e}`);
    try {
      const { notify } = await import("@/core/notify");
      await notify({
        title: "Database backup failed",
        body: String(e).slice(0, 300),
        level: "warn",
        source: "backup",
      });
    } catch {
      // notification failure must not mask the backup failure
    }
    return false;
  }
}

/** True if a backup from the last 25h already exists. */
export async function hasFreshBackup(): Promise<boolean> {
  try {
    const files = await readdir(BACKUP_DIR);
    const cutoff = Date.now() - 25 * 3600_000;
    for (const f of files) {
      if (!f.startsWith("aios-")) continue;
      const { mtimeMs } = await stat(join(BACKUP_DIR, f));
      if (mtimeMs > cutoff) return true;
    }
  } catch {
    // no dir yet
  }
  return false;
}
