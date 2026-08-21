import { TrendingUp } from "lucide-react";
import type { ModuleManifest } from "@/core/modules/types";

export const investmentsManifest: ModuleManifest = {
  id: "investments",
  title: "Investments",
  icon: TrendingUp,
  accent: "var(--color-ion)",
  nav: { order: 48 },
  commands: [
    {
      id: "investments.open",
      title: "Go to Investments",
      keywords: ["investments", "portfolio", "isentry", "stocks", "holdings"],
      href: "/m/investments",
    },
  ],
};
