import type { ModuleJob } from "@/core/modules/types.server";
import { pruneAttention, wakeSnoozed } from "./core";

/**
 * Heartbeat maintenance for the attention spine. Re-opens snoozed cards when
 * their time comes (so a snooze is reliable even if the app was closed) and
 * prunes long-dead rows. Every 5 minutes, cheap.
 */
export const todayJobs: ModuleJob[] = [
  {
    channel: "attention_sweep",
    schedule: "*/5 * * * *",
    handle: async () => {
      await wakeSnoozed();
      await pruneAttention();
    },
  },
];
