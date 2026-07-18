import type {
  ModuleRouteProps,
  ModuleServerManifest,
} from "./types.server";
import type { ComponentType } from "react";

/**
 * Match remaining path segments against a module's route table.
 * "" → module root; exact joined path wins; "[id]" matches one segment.
 */
export function resolveModuleRoute(
  mod: ModuleServerManifest,
  rest: string[],
): ComponentType<ModuleRouteProps> | null {
  if (rest.length === 0) return mod.routes[""] ?? null;
  const exact = mod.routes[rest.join("/")];
  if (exact) return exact;
  if (rest.length === 1 && mod.routes["[id]"]) return mod.routes["[id]"];
  return null;
}
