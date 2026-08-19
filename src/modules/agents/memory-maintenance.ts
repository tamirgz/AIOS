import type { ModuleJob } from "@/core/modules/types.server";
import { pruneMemoryEntries } from "@/core/memory";

/**
 * Daily maintenance for archival memory — ages out transient entries and caps
 * the total so the long-tail can't grow without bound. Deterministic and cheap;
 * the always-injected memory blocks are bounded separately (MAX_INJECTED_CHARS
 * in core/memory.ts), so nothing memory-related ever grows endless.
 */
export const memoryMaintenanceJobs: ModuleJob[] = [
  {
    channel: "memory_maintenance",
    schedule: "30 3 * * *", // 03:30 daily, a quiet hour
    handle: async () => {
      await pruneMemoryEntries();
    },
  },
];
