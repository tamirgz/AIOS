import type { AiToolDef } from "@/core/modules/types.server";
import { serverModules } from "@/modules/registry.server";

/** All module-declared AI tools, keyed by their dotted name ("tasks.create"). */
export function getToolRegistry(): Map<string, AiToolDef> {
  const map = new Map<string, AiToolDef>();
  for (const mod of serverModules) {
    for (const t of mod.aiTools) {
      if (map.has(t.name)) {
        throw new Error(`Duplicate AI tool name: ${t.name}`);
      }
      map.set(t.name, t);
    }
  }
  return map;
}

export function getAllTools(): AiToolDef[] {
  return [...getToolRegistry().values()];
}

/** Filter an allowlist (agent config) against the registry. */
export function getToolsByNames(names: string[]): AiToolDef[] {
  const reg = getToolRegistry();
  return names.flatMap((n) => {
    const t = reg.get(n);
    return t ? [t] : [];
  });
}
