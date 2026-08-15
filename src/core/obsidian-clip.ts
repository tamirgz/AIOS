/**
 * Write a report into the Obsidian vault's `raw/` folder with Web-Clipper-style
 * frontmatter, so the existing raw→wiki automation picks it up exactly as if it
 * had been clipped. Shared by Workbench outcomes and Ask answers so the format,
 * rules and destination are identical for both.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getSetting } from "@/core/app-settings";

export function safeFileName(title: string): string {
  return (
    title
      .replace(/[\\/:*?"<>|]/g, " ") // illegal on macOS/Windows
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 120) || "Untitled"
  );
}

export async function clipToObsidianRaw(input: {
  title: string;
  source: string;
  body: string;
  createdISODate: string; // "YYYY-MM-DD" (computed client-side; server has no Date)
}): Promise<{ path: string }> {
  const vault = (await getSetting("obsidian_vault_path"))?.trim();
  if (!vault) throw new Error("Set your Obsidian vault path in Settings first");

  const title = input.title.trim() || "Untitled report";
  const source = input.source.trim();
  const date = input.createdISODate;

  // YAML frontmatter matching the vault's existing clippings (tags: raw).
  const yamlTitle = title.replace(/"/g, "'");
  const frontmatter = [
    "---",
    `title: ${yamlTitle}`,
    `source: ${source}`,
    "author:",
    "published:",
    `created: ${date}`,
    "description:",
    "tags:",
    "  - raw",
    "---",
    "",
  ].join("\n");

  const dir = join(vault, "raw");
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${date} ${safeFileName(title)}.md`);
  await writeFile(path, frontmatter + input.body.trim() + "\n", "utf8");
  return { path };
}
