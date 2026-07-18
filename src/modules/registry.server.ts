// Server-side module registry — ONE line per module, mirroring registry.ts.
import type { ModuleServerManifest } from "@/core/modules/types.server";
import { tasksServerManifest } from "./tasks/manifest.server";
import { projectsServerManifest } from "./projects/manifest.server";
import { notesServerManifest } from "./notes/manifest.server";
import { contentServerManifest } from "./content/manifest.server";
import { settingsServerManifest } from "./settings/manifest.server";
import { knowledgeServerManifest } from "./knowledge/manifest.server";
import { agentsServerManifest } from "./agents/manifest.server";
import { calendarServerManifest } from "./calendar/manifest.server";
import { inboxServerManifest } from "./inbox/manifest.server";

export const serverModules: ModuleServerManifest[] = [
  inboxServerManifest,
  calendarServerManifest,
  tasksServerManifest,
  projectsServerManifest,
  notesServerManifest,
  contentServerManifest,
  knowledgeServerManifest,
  agentsServerManifest,
  settingsServerManifest,
];

export function getServerModule(
  id: string,
): ModuleServerManifest | undefined {
  return serverModules.find((m) => m.id === id);
}
