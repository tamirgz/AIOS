import { Radio } from "lucide-react";
import type { ModuleManifest } from "@/core/modules/types";

export const contentManifest: ModuleManifest = {
  id: "content",
  title: "Content",
  icon: Radio,
  accent: "var(--color-plasma)",
  nav: { order: 40 },
  commands: [
    {
      id: "content.open",
      title: "Go to Content",
      keywords: ["content", "pipeline", "publish", "board"],
      href: "/m/content",
    },
    {
      id: "content.new",
      title: "New content item",
      keywords: ["content", "add", "create", "post", "article", "video", "idea"],
      href: "/m/content",
    },
  ],
};
