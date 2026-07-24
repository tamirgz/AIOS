import type { ModuleJob } from "@/core/modules/types.server";
import { syncNotion } from "./sync";

/** Pull Notion pages every 30 min (no-op until a token is set). */
export const notionJobs: ModuleJob[] = [
  {
    channel: "notion_sync",
    schedule: "*/30 * * * *",
    handle: async () => {
      await syncNotion();
    },
  },
];
