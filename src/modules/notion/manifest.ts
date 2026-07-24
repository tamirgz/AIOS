import { NotebookText } from "lucide-react";
import type { ModuleManifest } from "@/core/modules/types";

export const notionManifest: ModuleManifest = {
  id: "notion",
  title: "Notion",
  icon: NotebookText,
  accent: "var(--color-ink-dim)",
  nav: { order: 46 }, // near the other integrations, before Settings
  commands: [
    {
      id: "notion.open",
      title: "Go to Notion",
      keywords: ["notion", "wiki", "docs"],
      href: "/m/notion",
    },
  ],
};
