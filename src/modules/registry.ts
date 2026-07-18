// Client-safe module registry — ONE line per module. Adding a module to the
// system means adding its manifest here and in registry.server.ts.
import type { ModuleManifest } from "@/core/modules/types";
import { tasksManifest } from "./tasks/manifest";

export const modules: ModuleManifest[] = [
  tasksManifest,
];

export const navModules = [...modules].sort(
  (a, b) => a.nav.order - b.nav.order,
);

export function getModule(id: string): ModuleManifest | undefined {
  return modules.find((m) => m.id === id);
}
