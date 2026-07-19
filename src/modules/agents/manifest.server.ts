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
  agentTemplates: [
    {
      id: "memory-consolidation",
      name: "Memory consolidation",
      description:
        "Weekly: reviews tasks, projects and recent knowledge, then rewrites the active_projects and current_focus memory blocks so every AI call starts with fresh context.",
      defaultPrompt:
        "Consolidate my working memory. Review tasks.list (todo and doing), projects.list, and knowledge.search for recent themes. Then rewrite the memory blocks: memory.update active_projects with a compressed live summary of projects and their real state, and memory.update current_focus with what I'm actually working on this week. Be terse — these blocks are injected into every AI call. Use ledger.mark with the ISO week (e.g. 2026-W30) so a re-run in the same week is a no-op after checking ledger.has.",
      defaultTools: [
        "tasks.list",
        "projects.list",
        "knowledge.search",
        "memory.update",
      ],
      defaultSchedule: "0 20 * * 0",
    },
  ],
};
