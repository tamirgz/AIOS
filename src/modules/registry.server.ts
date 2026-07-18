// Server-side module registry — ONE line per module, mirroring registry.ts.
import type { ModuleServerManifest } from "@/core/modules/types.server";
import { tasksServerManifest } from "./tasks/manifest.server";
import { projectsServerManifest } from "./projects/manifest.server";
import { notesServerManifest } from "./notes/manifest.server";
import { contentServerManifest } from "./content/manifest.server";
import { settingsServerManifest } from "./settings/manifest.server";

export const serverModules: ModuleServerManifest[] = [
  tasksServerManifest,
  projectsServerManifest,
  notesServerManifest,
  contentServerManifest,
  settingsServerManifest,
];

export function getServerModule(
  id: string,
): ModuleServerManifest | undefined {
  return serverModules.find((m) => m.id === id);
}
