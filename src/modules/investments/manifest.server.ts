import type { ModuleServerManifest } from "@/core/modules/types.server";
import { InvestmentsPage } from "./pages/InvestmentsPage";
import { investmentTools } from "./tools";
import { marketTools } from "./market";
import { investmentInsightTemplate } from "./insight";
import { charts } from "./schema";

export const investmentsServerManifest: ModuleServerManifest = {
  id: "investments",
  routes: { "": InvestmentsPage },
  widgets: [],
  // Portfolio data lives in iSentry (Supabase); apOS owns only the generated
  // `charts` produced by viz.chart.
  schema: { charts },
  aiTools: [...investmentTools, ...marketTools],
  agentTemplates: [investmentInsightTemplate],
};
