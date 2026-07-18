import type { ModuleServerManifest } from "@/core/modules/types.server";
import { inboxItems } from "./schema";
import { inboxJobs } from "./triage";
import { InboxPage } from "./pages/InboxPage";
import { InboxWidget } from "./widgets/InboxWidget";

export const inboxServerManifest: ModuleServerManifest = {
  id: "inbox",
  routes: {
    "": InboxPage,
  },
  widgets: [
    { id: "inbox", title: "Inbox", size: "sm", component: InboxWidget },
  ],
  schema: { inboxItems },
  aiTools: [],
  agentTemplates: [],
  jobs: inboxJobs,
};
