import { db } from "@/core/db/client";
import type { ModuleJob } from "@/core/modules/types.server";
import { projects } from "./schema";

/**
 * Project embeddings now include their linked task/note titles (so the theme
 * is grounded in real work — see core/embeddings.ts), which drift as tasks
 * change. The embedding sweep only fills NULL rows, so clear them nightly; the
 * sweep rebuilds within a couple of minutes with current content. Cheap — a
 * handful of projects.
 */
export const projectReembedJobs: ModuleJob[] = [
  {
    channel: "projects_reembed",
    schedule: "0 3 * * *",
    handle: async () => {
      await db.update(projects).set({ embedding: null });
    },
  },
];
