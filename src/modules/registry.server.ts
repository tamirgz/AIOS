// Server-side module registry — ONE line per module, mirroring registry.ts.
import type { ModuleServerManifest } from "@/core/modules/types.server";

export const serverModules: ModuleServerManifest[] = [
  // (modules register here)
];

export function getServerModule(
  id: string,
): ModuleServerManifest | undefined {
  return serverModules.find((m) => m.id === id);
}
