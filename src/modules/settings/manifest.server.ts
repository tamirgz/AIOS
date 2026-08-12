import type { ModuleServerManifest } from "@/core/modules/types.server";
import { ModelsPage } from "./pages/ModelsPage";
import { ConnectionsPage } from "./pages/ConnectionsPage";
import { MemoryPage } from "./pages/MemoryPage";
import { UsagePage } from "./pages/UsagePage";

export const settingsServerManifest: ModuleServerManifest = {
  id: "settings",
  // Settings is split into focused sub-pages (a shared tab nav switches them);
  // the root defaults to Models & Routing.
  routes: {
    "": ModelsPage,
    models: ModelsPage,
    connections: ConnectionsPage,
    memory: MemoryPage,
    usage: UsagePage,
  },
  widgets: [],
  schema: {},
  aiTools: [],
  agentTemplates: [],
};
