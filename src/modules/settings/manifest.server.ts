import type { ModuleServerManifest } from "@/core/modules/types.server";
import { SettingsPage } from "./pages/SettingsPage";

export const settingsServerManifest: ModuleServerManifest = {
  id: "settings",
  routes: {
    "": SettingsPage,
  },
  widgets: [],
  schema: {},
  aiTools: [],
  agentTemplates: [],
};
