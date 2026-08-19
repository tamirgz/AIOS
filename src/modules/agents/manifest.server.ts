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
      defaultPrompt: [
        "Consolidate the user's WORKING MEMORY — the two blocks injected into EVERY AI call, so keep them tight, accurate and current.",
        "1. Read projects.list (state, goal, next action, health, task counts) and tasks.list (todo/doing). Optionally memory.review('episodic') for recent activity signals.",
        "2. memory.update 'active_projects' — ONE compressed line per ACTIVE project: name — state — the real next thing. Terse; no filler.",
        "3. memory.update 'current_focus' — 2-4 lines synthesising what the user is ACTUALLY pushing this week (infer from health, next-actions, overdue counts, idleness). Specific and honest, not a list restatement.",
        "Use ledger.mark with the ISO week (e.g. 2026-W30) so a same-week re-run is a no-op after checking ledger.has. Do NOT touch other memory blocks.",
      ].join("\n"),
      defaultTools: [
        "tasks.list",
        "projects.list",
        "knowledge.search",
        "memory.review",
        "memory.update",
      ],
      defaultSchedule: "0 20 * * 0",
      // Memory work runs on a FREE LOCAL model — periodic, must never bill.
      // Benched across MLX/gemma4/Haiku: the MLX abliterated-35B wins on single-
      // shot TEXT, but in the REAL agentic tool-loop it loops on reads and never
      // commits the memory.update writes (verified: 20 reads, 0 writes). qwen3-
      // coder:30b reliably completes the loop and writes strong blocks — it's
      // what pulse/advisor run on daily. Editable per-agent in Settings.
      defaultProvider: "ollama",
      defaultModel: "qwen3-coder:30b",
      defaultTurnBudget: 20,
    },
  ],
};
