import type { ModuleServerManifest } from "@/core/modules/types.server";
import { attentionItems } from "./schema";
import { todayTools } from "./tools";
import { todayJobs } from "./jobs";
import { TodayPage } from "./pages/TodayPage";
import { NeedsYouWidget } from "./widgets/NeedsYouWidget";

export const todayServerManifest: ModuleServerManifest = {
  id: "today",
  routes: {
    "": TodayPage,
  },
  widgets: [
    {
      id: "today-focus",
      title: "Needs you",
      size: "md",
      component: NeedsYouWidget,
      priority: 1,
      span: 2,
    },
  ],
  schema: { attentionItems },
  aiTools: todayTools,
  agentTemplates: [
    {
      id: "daily-planner",
      name: "Daily planner",
      description:
        "Every weekday morning: reads your calendar, due tasks and active projects, then proposes the day and raises the 1–2 things that matter as attention cards. Runs on a free local model.",
      // Reads the day, sets/uses project next-actions, and surfaces the few
      // things worth attention. Idempotent per calendar day via dedupeKey.
      defaultPrompt: [
        "You are the user's chief-of-staff planning the day. Today's plan surface already shows their calendar and due tasks — your job is judgment, not repetition.",
        "1. Call today.getContext-style tools: use attention.list to see what's already surfaced (never duplicate), projects.withoutNextAction to find active projects lacking a next step.",
        "2. For at most the 2 most important active projects with no next-action, set a concrete one with projects.setNextAction.",
        "3. Raise at most 2–3 attention items for what genuinely needs the user today: a 'do' card for the single most important next-action, and a 'notify' if something is slipping. Use type 'do'/'notify'; reserve 'approve' for real side-effects (there are none here). Give each a dedupeKey like 'plan:<YYYY-MM-DD>:<slug>' so a re-run today is a no-op.",
        "4. Keep it minimal — a good chief of staff surfaces the vital few, not everything. Do not send notifications; the cards are the output.",
      ].join("\n"),
      defaultTools: [
        "attention.raise",
        "attention.list",
        "projects.setNextAction",
        "projects.withoutNextAction",
        "tasks.list",
        "gmail.recent",
        "search.everything",
      ],
      defaultSchedule: "30 7 * * 1-5", // 07:30 on weekdays
      // FREE local model — the heartbeat never bills (ONE-STOP §4). Benched
      // 2026-07-23: qwen3-coder:30b matches qwen3:8b on quality but runs ~4-5×
      // faster (16-25s vs 77-110s), and unifies both morning agents on one warm
      // model. Free NVIDIA cloud models lost badly (slow / timed out).
      defaultProvider: "ollama",
      defaultModel: "qwen3-coder:30b",
    },
  ],
  jobs: todayJobs,
};
