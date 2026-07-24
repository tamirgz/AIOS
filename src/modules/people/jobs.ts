import type { ModuleJob } from "@/core/modules/types.server";
import { syncPeopleFromCalendar } from "./core";

/**
 * Rebuild the people table from calendar attendees. Cheap full recompute every
 * 30 min (calendar itself syncs every 5), and on demand via NOTIFY people_sync.
 */
export const peopleJobs: ModuleJob[] = [
  {
    channel: "people_sync",
    schedule: "*/30 * * * *",
    handle: async () => {
      await syncPeopleFromCalendar();
    },
  },
];
