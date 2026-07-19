import type { ModuleServerManifest } from "@/core/modules/types.server";
import { obsidianNotes } from "./schema";
import { obsidianTools } from "./tools";
import { obsidianJobs } from "./sync";
import { VaultPage } from "./pages/VaultPage";

export const obsidianServerManifest: ModuleServerManifest = {
  id: "vault",
  routes: {
    "": VaultPage,
  },
  widgets: [],
  schema: { obsidianNotes },
  aiTools: obsidianTools,
  agentTemplates: [],
  jobs: obsidianJobs,
};
