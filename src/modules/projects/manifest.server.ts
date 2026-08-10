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
    {
      id: "project-advisor",
      name: "Project advisor",
      description:
        "Chief-of-staff read per active project: where it stands, the one real blocker, and the single next move — grounded in the project's tasks, notes and (for code projects) its actual repo. Runs on Haiku for quality; refreshable on demand from the project cockpit.",
      defaultPrompt: [
        "You are the user's chief-of-staff. For each ACTIVE project, write a sharp, grounded read the user could act on immediately — where it stands, the one real blocker, and the single next move. Generic advice is a failure.",
        "1. Call projects.list — your world model (goal, health, open/done/overdue counts, daysSinceActivity). Only consider status = 'active'.",
        "2. For each active project, gather EVIDENCE before writing: call tasks.list for its open/overdue tasks; if it is a code project, call projects.readRepo to see recent commits + README, and ground your read in what's actually happening in the code.",
        "3. Write the read with projects.setAdvisorBrief(projectId, state, blocker, recommendation):",
        "   - state: 2-3 sentences on where it ACTUALLY stands, citing evidence (a specific task, a recent commit, N days idle). Do NOT restate the goal or pad with filler.",
        "   - blocker: the ONE real thing holding it up (a missing decision, an external dependency, a stalled task), or null if it is genuinely unblocked.",
        "   - recommendation: the single most useful next move — concrete and doable this week.",
        "4. Be specific and honest. If a project is healthy, say so in one line. Do not send notifications and do not raise cards — the briefs are the only output.",
      ].join("\n"),
      defaultTools: [
        "projects.list",
        "tasks.list",
        "projects.readRepo",
        "projects.setAdvisorBrief",
      ],
      defaultSchedule: "15 7 * * 1-5", // 07:15 weekdays — just after Project-pulse
      // Haiku: judgement-heavy synthesis where quality compounds (the advisor is
      // the brain). Cheap at a few projects/day; a deliberate metered exception
      // to the free-periodic rule, chosen by the user. Routable per-agent.
      defaultProvider: "anthropic",
      defaultModel: "claude-haiku-4-5-20251001",
    },
    {
      // A1 — the first Routine: a repo watcher. Read-only (reads the read-only
      // clone), free local model, and GATED by A2 verification — the run is
      // only "done" if it actually recorded a digest (defaultSuccessTool).
      id: "repo-watcher",
      name: "Repo watcher",
      description:
        "Per project with an attached code repo, summarizes what the recent commits actually did into a short digest on the cockpit — so the advisor and you can see code momentum without reading the log. Read-only, free local model; a run only counts as done if it recorded a digest.",
      defaultPrompt: [
        "You watch each project's code so the user doesn't have to read git logs. Produce a short, concrete digest of what's actually moving in the code.",
        "1. Call projects.list. Only consider status = 'active'.",
        "2. For each active project, call projects.readRepo. If attached is false, SKIP it — no repo, nothing to watch.",
        "3. For each project that HAS a repo, read its recentCommits and write a 2-3 sentence digest via projects.recordRepoDigest: what the recent commits actually did (themes, notable changes, momentum). Be specific — name the real work, not 'various updates'. No repo → do not call recordRepoDigest for it.",
        "4. Do not raise cards or send anything. The digests are the only output.",
      ].join("\n"),
      defaultTools: [
        "projects.list",
        "projects.readRepo",
        "projects.recordRepoDigest",
      ],
      // A2: the run fails unless it actually recorded at least one digest.
      defaultSuccessTool: "projects.recordRepoDigest",
      defaultSchedule: "45 7 * * 1-5", // weekday 07:45, after pulse/advisor
      // Read + summarize on the free bench-winner; never bills.
      defaultProvider: "ollama",
      defaultModel: "qwen3-coder:30b",
    },
  ],
};
