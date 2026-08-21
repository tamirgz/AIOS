"use server";

import { sql } from "@/core/db/client";

export async function requestVaultSync() {
  await sql.notify("obsidian_sync", "manual");
}

/**
 * Write a markdown note into the Obsidian vault (under an `apOS/` subfolder) so a
 * chat response can be saved to the user's second brain. Requires the vault path
 * to be configured (Settings → the same one the read-only sync uses).
 */
export async function saveMarkdownToVault(input: {
  title: string;
  body: string;
}): Promise<{ ok: boolean; path?: string; error?: string }> {
  const { getSetting } = await import("@/core/app-settings");
  const { OBSIDIAN_PATH_KEY } = await import("./sync");
  const root = (await getSetting(OBSIDIAN_PATH_KEY))?.trim();
  if (!root)
    return {
      ok: false,
      error: "No Obsidian vault path configured (Settings → Connections).",
    };

  const { writeFile, mkdir } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const slug =
    input.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "apos-note";
  const dir = join(root, "apOS");
  const rel = `apOS/${slug}.md`;
  try {
    await mkdir(dir, { recursive: true });
    const front = `---\nsource: apOS chat\ncreated: ${new Date().toISOString()}\n---\n\n`;
    await writeFile(
      join(dir, `${slug}.md`),
      `${front}# ${input.title}\n\n${input.body}\n`,
      "utf8",
    );
    // Pull the new file into apOS's index too (best-effort).
    await sql.notify("obsidian_sync", "manual").catch(() => {});
    return { ok: true, path: rel };
  } catch (e) {
    return { ok: false, error: String(e).slice(0, 160) };
  }
}
