import { mkdir, readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { sql as dsql } from "drizzle-orm";
import { db, sql } from "@/core/db/client";
import { getSetting } from "@/core/app-settings";
import type { ModuleJob } from "@/core/modules/types.server";
import { externalReports } from "./schema";

export const REPORTS_DIR_KEY = "external_reports_dir";
const DEFAULT_REPORTS_DIR = join(homedir(), "AIOS", "agent-reports");
const CLAUDE_JOBS_DIR = join(homedir(), ".claude", "jobs");
const MAX_BODY = 30_000;

export async function getReportsDir(): Promise<string> {
  return (await getSetting(REPORTS_DIR_KEY))?.trim() || DEFAULT_REPORTS_DIR;
}

async function upsertReport(input: {
  source: string;
  kind: "dropbox" | "claude-job";
  title: string;
  body: string;
  reportedAt: Date;
}): Promise<boolean> {
  const [row] = await db
    .insert(externalReports)
    .values(input)
    .onConflictDoUpdate({
      target: externalReports.source,
      set: {
        title: input.title,
        body: input.body,
        reportedAt: input.reportedAt,
        ingestedAt: new Date(),
      },
      // Only re-ingest when the origin actually produced something newer.
      setWhere: dsql`${externalReports.reportedAt} < ${input.reportedAt.toISOString()}::timestamptz`,
    })
    .returning({ id: externalReports.id });
  // A row comes back only on fresh insert or a genuinely-newer update.
  return !!row;
}

function titleFromMarkdown(content: string, fallback: string): string {
  const h1 = content.match(/^#\s+(.+)$/m);
  return (h1 ? h1[1] : fallback).trim().slice(0, 150);
}

/** Intake 1 — drop-box: any .md/.txt/.json file written by an external agent. */
async function scanDropbox(log: (m: string) => void): Promise<number> {
  const dir = await getReportsDir();
  await mkdir(dir, { recursive: true });
  let fresh = 0;
  for (const name of await readdir(dir)) {
    if (!/\.(md|txt|json)$/i.test(name)) continue;
    const file = join(dir, name);
    const s = await stat(file);
    if (!s.isFile() || s.size > 1_000_000) continue;
    const content = (await readFile(file, "utf8")).slice(0, MAX_BODY);
    const isNew = await upsertReport({
      source: `file:${name}`,
      kind: "dropbox",
      title: titleFromMarkdown(content, name.replace(/\.(md|txt|json)$/i, "")),
      body: content,
      reportedAt: new Date(s.mtimeMs),
    });
    if (isNew) {
      fresh++;
      const { notify } = await import("@/core/notify");
      await notify({
        title: `External report: ${name}`,
        body: content.slice(0, 300),
        level: "info",
        source: "external:dropbox",
        href: "/m/agents",
      });
    }
  }
  return fresh;
}

/** Intake 2 — Claude Desktop background jobs (~/.claude/jobs/<id>/state.json). */
async function scanClaudeJobs(log: (m: string) => void): Promise<number> {
  let fresh = 0;
  let entries: string[] = [];
  try {
    entries = await readdir(CLAUDE_JOBS_DIR);
  } catch {
    return 0; // no jobs dir — nothing to do
  }
  for (const entry of entries) {
    const stateFile = join(CLAUDE_JOBS_DIR, entry, "state.json");
    let state: {
      name?: string;
      intent?: string;
      state?: string;
      detail?: string;
      output?: string | null;
      updatedAt?: string;
    };
    try {
      state = JSON.parse(await readFile(stateFile, "utf8"));
    } catch {
      continue;
    }
    // Only finished jobs with something to show.
    const body = state.output ?? (state.state === "working" ? null : state.detail);
    if (!body) continue;
    const isNew = await upsertReport({
      source: `claude-job:${entry}`,
      kind: "claude-job",
      title: (state.name ?? state.intent ?? entry).slice(0, 150),
      body: String(body).slice(0, MAX_BODY),
      reportedAt: state.updatedAt ? new Date(state.updatedAt) : new Date(),
    });
    if (isNew) {
      fresh++;
      const { notify } = await import("@/core/notify");
      await notify({
        title: `Claude Desktop job: ${state.name ?? entry}`,
        body: String(body).slice(0, 300),
        level: "info",
        source: "external:claude-desktop",
        href: "/m/agents",
      });
    }
  }
  return fresh;
}

export async function scanExternalReports(
  log: (m: string) => void = () => {},
): Promise<void> {
  const a = await scanDropbox(log);
  const b = await scanClaudeJobs(log);
  if (a + b > 0) {
    await sql.notify("external_reports", String(a + b));
    log(`external reports: ${a} from drop-box, ${b} from claude jobs`);
  }
}

export const externalReportJobs: ModuleJob[] = [
  {
    channel: "external_reports_scan",
    schedule: "*/5 * * * *",
    handle: async () => {
      await scanExternalReports(console.log);
    },
  },
];
