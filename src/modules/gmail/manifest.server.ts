import type { ModuleServerManifest } from "@/core/modules/types.server";
import { gmailMessages } from "./schema";
import { gmailTools } from "./tools";
import { gmailJobs } from "./jobs";
import { GmailPage } from "./pages/GmailPage";

export const gmailServerManifest: ModuleServerManifest = {
  id: "gmail",
  routes: {
    "": GmailPage,
  },
  // No dashboard widget — Mail lives on its own page (keeps the deck uncluttered).
  widgets: [],
  schema: { gmailMessages },
  aiTools: gmailTools,
  jobs: gmailJobs,
  agentTemplates: [],
};
