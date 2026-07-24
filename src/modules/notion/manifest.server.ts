import type { ModuleServerManifest } from "@/core/modules/types.server";
import { notionPages } from "./schema";
import { notionJobs } from "./jobs";
import { NotionPage } from "./pages/NotionPage";

export const notionServerManifest: ModuleServerManifest = {
  id: "notion",
  routes: {
    "": NotionPage,
  },
  widgets: [],
  schema: { notionPages },
  aiTools: [],
  jobs: notionJobs,
  agentTemplates: [],
};
