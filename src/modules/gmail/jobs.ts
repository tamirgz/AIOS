import type { ModuleJob } from "@/core/modules/types.server";
import { syncGmail } from "./sync";

/** Pull recent Gmail metadata every 10 min, and on demand via NOTIFY gmail_sync. */
export const gmailJobs: ModuleJob[] = [
  {
    channel: "gmail_sync",
    schedule: "*/10 * * * *",
    handle: async () => {
      await syncGmail();
    },
  },
];
