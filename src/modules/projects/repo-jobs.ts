import { eq, isNotNull } from "drizzle-orm";
import type { ModuleJob } from "@/core/modules/types.server";
import { db } from "@/core/db/client";
import { projects } from "./schema";
import { syncProjectRepo } from "./repo";

const log = (m: string) => console.log(`[projects] ${m}`);

async function syncOne(id: string): Promise<void> {
  const [p] = await db
    .select({ id: projects.id, repoUrl: projects.repoUrl })
    .from(projects)
    .where(eq(projects.id, id));
  if (!p?.repoUrl) return;
  const r = await syncProjectRepo(p.id, p.repoUrl);
  log(`repo ${p.id.slice(0, 8)} — ${r.ok ? r.detail : `FAILED: ${r.detail}`}`);
}

async function syncAll(): Promise<void> {
  const rows = await db
    .select({ id: projects.id, repoUrl: projects.repoUrl })
    .from(projects)
    .where(isNotNull(projects.repoUrl));
  for (const p of rows) {
    if (!p.repoUrl) continue;
    const r = await syncProjectRepo(p.id, p.repoUrl);
    log(`repo ${p.id.slice(0, 8)} — ${r.ok ? r.detail : `FAILED: ${r.detail}`}`);
  }
}

/** Clone/refresh project repos. NOTIFY payload = one projectId; empty = all. */
export const projectRepoJobs: ModuleJob[] = [
  {
    channel: "project_repos_sync",
    schedule: "*/30 * * * *", // keep the read-only clones fresh
    handle: async (payload) => {
      const id = payload?.trim();
      if (id && /^[0-9a-f-]{36}$/i.test(id)) await syncOne(id);
      else await syncAll();
    },
  },
];
