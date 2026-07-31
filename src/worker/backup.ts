import { exec } from "node:child_process";
import { promisify } from "node:util";
import { copyFile, mkdir, readdir, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { homedir, tmpdir } from "node:os";

const execAsync = promisify(exec);

// Where finished dumps live. Configurable via AIOS_BACKUP_DIR so this can point
// at a cloud-synced folder (e.g. Google Drive for Desktop) for offsite backup;
// defaults to a local folder. Read at call time, NOT module load: dotenv's
// config() runs after import hoisting, so a module-level const would miss a
// value that lives only in .env.local (unlike plist-injected vars).
function backupDir(): string {
  return process.env.AIOS_BACKUP_DIR?.trim() || join(homedir(), "Backups", "aios");
}
const KEEP = 14;

const url =
  process.env.DATABASE_URL ?? "postgres://aios:aios@localhost:5544/aios";

/** Nightly pg_dump → gzip with simple retention. Never throws. */
export async function runBackup(
  log: (msg: string) => void,
): Promise<boolean> {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, "-");
  const name = `aios-${stamp}.sql.gz`;
  const tmp = join(tmpdir(), name);
  try {
    // Dump to a local temp first, then move the finished file into place — so a
    // partial write never appears as a "complete" dump in a cloud-synced
    // folder (and we don't stream gzip straight into a FUSE mount).
    await execAsync(`pg_dump "${url}" | gzip > "${tmp}"`, { timeout: 120_000 });
    const { size } = await stat(tmp);
    if (size < 1024) throw new Error(`dump suspiciously small (${size} bytes)`);

    const dir = backupDir();
    await mkdir(dir, { recursive: true });
    const file = join(dir, name);
    await copyFile(tmp, file);
    await unlink(tmp).catch(() => {});
    log(`backup written: ${file} (${(size / 1024).toFixed(0)} KB)`);

    // Retention: keep the newest KEEP dumps.
    const files = (await readdir(dir))
      .filter((f) => f.startsWith("aios-") && f.endsWith(".sql.gz"))
      .sort()
      .reverse();
    for (const old of files.slice(KEEP)) {
      await unlink(join(dir, old));
      log(`backup pruned: ${old}`);
    }
    return true;
  } catch (e) {
    await unlink(tmp).catch(() => {}); // don't leave a partial temp behind
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
    const dir = backupDir();
    const files = await readdir(dir);
    const cutoff = Date.now() - 25 * 3600_000;
    for (const f of files) {
      if (!f.startsWith("aios-")) continue;
      const { mtimeMs } = await stat(join(dir, f));
      if (mtimeMs > cutoff) return true;
    }
  } catch {
    // no dir yet
  }
  return false;
}
