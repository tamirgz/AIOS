import type { ModuleServerManifest } from "@/core/modules/types.server";
import { externalReports } from "./schema";
import { externalReportJobs } from "./external";
import { slackIntakeJobs } from "./slack-intake";
import { memoryMaintenanceJobs } from "./memory-maintenance";
import { memoryDistillJobs } from "./memory-distill";
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
  // Core owns agents/agent_runs; this module owns external_reports.
  schema: { externalReports },
  aiTools: [],
  jobs: [
    ...externalReportJobs,
    ...slackIntakeJobs,
    ...memoryMaintenanceJobs,
    ...memoryDistillJobs,
  ],
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
        "memory.review",
        "memory.update",
      ],
      defaultSchedule: "0 20 * * 0",
      // Memory work runs on a FREE LOCAL model — it's periodic and must never
      // bill (ONE-STOP §4). Without this it falls through to agent.default.
      defaultProvider: "ollama",
      defaultModel: "qwen3-coder:30b",
    },
  ],
};
