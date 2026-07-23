// Server-side module registry — ONE line per module, mirroring registry.ts.
import type { ModuleServerManifest } from "@/core/modules/types.server";
import { tasksServerManifest } from "./tasks/manifest.server";
import { projectsServerManifest } from "./projects/manifest.server";
import { notesServerManifest } from "./notes/manifest.server";
import { ideasServerManifest } from "./ideas/manifest.server";
import { settingsServerManifest } from "./settings/manifest.server";
import { knowledgeServerManifest } from "./knowledge/manifest.server";
import { agentsServerManifest } from "./agents/manifest.server";
import { calendarServerManifest } from "./calendar/manifest.server";
import { inboxServerManifest } from "./inbox/manifest.server";
import { obsidianServerManifest } from "./obsidian/manifest.server";
import { workbenchServerManifest } from "./workbench/manifest.server";
import { todayServerManifest } from "./today/manifest.server";

export const serverModules: ModuleServerManifest[] = [
  todayServerManifest,
  inboxServerManifest,
  calendarServerManifest,
  workbenchServerManifest,
  tasksServerManifest,
  projectsServerManifest,
  notesServerManifest,
  ideasServerManifest,
  knowledgeServerManifest,
  obsidianServerManifest,
  agentsServerManifest,
  settingsServerManifest,
];

export function getServerModule(
  id: string,
): ModuleServerManifest | undefined {
  return serverModules.find((m) => m.id === id);
}
