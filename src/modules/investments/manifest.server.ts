import type { ModuleServerManifest } from "@/core/modules/types.server";
import { InvestmentsPage } from "./pages/InvestmentsPage";
import { investmentTools } from "./tools";
import { investmentInsightTemplate } from "./insight";

export const investmentsServerManifest: ModuleServerManifest = {
  id: "investments",
  routes: { "": InvestmentsPage },
  widgets: [],
  // apOS owns NO investment tables — iSentry (Supabase) is the system of record.
  schema: {},
  aiTools: investmentTools,
  agentTemplates: [investmentInsightTemplate],
};
