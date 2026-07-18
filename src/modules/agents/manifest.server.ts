import type { ModuleServerManifest } from "@/core/modules/types.server";
import { AgentsPage } from "./pages/AgentsPage";
import { AgentDetailPage } from "./pages/AgentDetailPage";
import { AgentActivityWidget } from "./widgets/AgentActivityWidget";

export const agentsServerManifest: ModuleServerManifest = {
  id: "agents",
  routes: {
    "": AgentsPage,
    "[id]": AgentDetailPage,
  },
  widgets: [
    {
      id: "agent-activity",
      title: "Agent activity",
      size: "md",
      component: AgentActivityWidget,
    },
  ],
  // Agent tables live in core (the worker owns them) — no module schema.
  schema: {},
  aiTools: [],
  agentTemplates: [],
};
