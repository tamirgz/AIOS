import type { ModuleServerManifest } from "@/core/modules/types.server";
import { features, projectFiles, projects } from "./schema";
import { projectTools } from "./tools";
import { projectFilesJobs } from "./files-pipeline";
import { projectReembedJobs } from "./reembed";
import { projectRepoJobs } from "./repo-jobs";
import { ProjectsPage } from "./pages/ProjectsPage";
import { ProjectDetailPage } from "./pages/ProjectDetailPage";
import { ActiveProjectsWidget } from "./widgets/ActiveProjectsWidget";

export const projectsServerManifest: ModuleServerManifest = {
  id: "projects",
  routes: {
    "": ProjectsPage,
    "[id]": ProjectDetailPage,
  },
  widgets: [
    {
      id: "active-projects",
      title: "Active projects",
      size: "sm",
      component: ActiveProjectsWidget,
    },
  ],
  schema: { projects, projectFiles, features },
  aiTools: projectTools,
  jobs: [...projectFilesJobs, ...projectReembedJobs, ...projectRepoJobs],
  agentTemplates: [
    {
      id: "project-pulse",
      name: "Project pulse",
      description:
        "Weekday heartbeat over your active projects: derives each one's health, fills a missing goal or next-action, and raises a card only for the ones that are stalled or blocked. Runs on a free local model.",
      // Observe the world model (projects.list already carries health, counts
      // and days-since-activity), then act only where it matters. Idempotent
      // per project per ISO week via the dedupeKey.
      defaultPrompt: [
        "You are the user's chief-of-staff for their projects. Your job is to keep each active project honest — a clear health, a clear next step — and to surface only the few that genuinely need the user.",
        "1. Call projects.list. It gives you, per project: status, goal, nextAction, health + healthReason, open/done/overdue task counts, and daysSinceActivity. Only consider status = 'active'.",
        "2. For each active project, record your judgement with projects.setHealth (health + a one-line reason). Use 'blocked' when it's clearly waiting on someone/something external; 'stalled' when nothing has moved for ~2 weeks; 'at_risk' when a next-action is missing or a task is overdue; otherwise 'on_track'. Base it on the counts and activity, not guesswork.",
        "3. If an active project has no goal, set a plausible one with projects.setGoal. If it has no nextAction, set a concrete one with projects.setNextAction.",
        "4. Raise an attention card ONLY for active projects whose health is 'stalled' or 'blocked'. Use attention.raise with type 'notify' (or 'do' if there's a clear unblocking step), projectRef 'projects:<id>', a short title, the reason in the body, and dedupeKey 'pulse:<projectId>:<ISO-week>' (e.g. 'pulse:ab12:2026-W30') so re-running this week is a no-op. Call attention.list first to avoid duplicating what's already open.",
        "5. Be minimal. On-track and at-risk projects get a health update but NO card — the cockpit already shows them. Do not send notifications; the cards and health are the output.",
      ].join("\n"),
      defaultTools: [
        "projects.list",
        "projects.setHealth",
        "projects.setGoal",
        "projects.setNextAction",
        "attention.raise",
        "attention.list",
        "tasks.list",
      ],
      defaultSchedule: "0 7 * * 1-5", // 07:00 weekdays — before the 07:30 planner
      // FREE local model — the heartbeat never bills (ONE-STOP §4). Chosen by a
      // 12-model bench of this exact task (2026-07-23): qwen3-coder:30b was the
      // only model that, across repeated runs, set correct health on every
      // project AND reliably raised stall/blocker cards — score 94 vs 42 for
      // qwen3:8b. See docs/EXECUTION-PLAN.md.
      defaultProvider: "ollama",
      defaultModel: "qwen3-coder:30b",
    },
  ],
};
