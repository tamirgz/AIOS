import type { ModuleServerManifest } from "@/core/modules/types.server";
import { AskPage } from "./pages/AskPage";

export const askServerManifest: ModuleServerManifest = {
  id: "ask",
  routes: {
    "": AskPage,
  },
  widgets: [],
  schema: {},
  aiTools: [],
  agentTemplates: [],
};
