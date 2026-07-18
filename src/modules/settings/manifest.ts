import { SlidersHorizontal } from "lucide-react";
import type { ModuleManifest } from "@/core/modules/types";

export const settingsManifest: ModuleManifest = {
  id: "settings",
  title: "Settings",
  icon: SlidersHorizontal,
  accent: "var(--color-ion)",
  nav: { order: 90 },
  commands: [
    {
      id: "settings.open",
      title: "Go to Settings",
      keywords: ["settings", "config", "providers", "models", "routing"],
      href: "/m/settings",
    },
  ],
};
