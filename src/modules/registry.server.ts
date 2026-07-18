// Server-side module registry — ONE line per module, mirroring registry.ts.
import type { ModuleServerManifest } from "@/core/modules/types.server";
import { tasksServerManifest } from "./tasks/manifest.server";

export const serverModules: ModuleServerManifest[] = [
  tasksServerManifest,
];

export function getServerModule(
  id: string,
): ModuleServerManifest | undefined {
  return serverModules.find((m) => m.id === id);
}
