import type { ModuleServerManifest } from "@/core/modules/types.server";
import { gmailMessages } from "./schema";
import { gmailTools } from "./tools";
import { gmailJobs } from "./jobs";
import { GmailPage } from "./pages/GmailPage";
import { GmailWidget } from "./widgets/GmailWidget";

export const gmailServerManifest: ModuleServerManifest = {
  id: "gmail",
  routes: {
    "": GmailPage,
  },
  widgets: [{ id: "gmail", title: "Mail", size: "sm", component: GmailWidget }],
  schema: { gmailMessages },
  aiTools: gmailTools,
  jobs: gmailJobs,
  agentTemplates: [],
};
