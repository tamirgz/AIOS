import type { ModuleServerManifest } from "@/core/modules/types.server";
import { people } from "./schema";
import { peopleTools } from "./tools";
import { peopleJobs } from "./jobs";
import { PeoplePage } from "./pages/PeoplePage";
import { PersonDetailPage } from "./pages/PersonDetailPage";
import { PeopleWidget } from "./widgets/PeopleWidget";

export const peopleServerManifest: ModuleServerManifest = {
  id: "people",
  routes: {
    "": PeoplePage,
    "[id]": PersonDetailPage,
  },
  widgets: [
    { id: "people", title: "People", size: "sm", component: PeopleWidget },
  ],
  schema: { people },
  aiTools: peopleTools,
  jobs: peopleJobs,
  agentTemplates: [
    {
      id: "followup-tracker",
      name: "Follow-up tracker",
      description:
        "After your meetings, proposes the follow-ups worth doing — one card per person, into the 'Needs you' queue. Runs on a free local model.",
      defaultPrompt: [
        "You are the user's chief-of-staff handling post-meeting follow-ups. Surface only the follow-ups that genuinely matter — a good chief of staff is selective.",
        "1. Call people.recentMeetings (last 2 days) to see meetings that already happened, with attendees. Call attention.list to see what follow-ups are already open (never duplicate).",
        "2. For a meeting that plausibly needs a follow-up (a real external person, a 1:1, a decision or an ask that would have come up), pick the key attendee. Find their id via people.list (match on email).",
        "3. Raise ONE follow-up with followup.raise: type 'do' with a concrete step ('Send Dana the Q3 numbers you promised'), or 'approve' only if it means sending a real message. Give a dedupeKey 'followup:<email>:<meeting-date>' so re-running doesn't duplicate.",
        "4. Skip internal noise, all-hands, and meetings with no clear action. Do not send anything — the cards are the output. Aim for at most 3-4 follow-ups.",
      ].join("\n"),
      defaultTools: [
        "people.recentMeetings",
        "people.list",
        "followup.raise",
        "attention.list",
        "people.setNotes",
      ],
      defaultSchedule: "0 18 * * 1-5", // 18:00 weekdays, after the day's meetings
      defaultProvider: "ollama",
      defaultModel: "qwen3-coder:30b",
    },
    {
      id: "loose-ends-chaser",
      name: "Loose-ends chaser",
      description:
        "Twice a week, scans projects, tasks and people for things quietly slipping and surfaces the few worth catching. Free local model.",
      defaultPrompt: [
        "You are the user's chief-of-staff catching loose ends before they become problems. Be selective — surface the vital few, not everything.",
        "1. Read the world: projects.list (health, days since activity), tasks.list (overdue / stale), people.list (whom you haven't met in a while but usually do). Call attention.list to avoid duplicating open cards.",
        "2. Identify genuine loose ends: an overdue task with no movement, a project quietly stalling, a key person gone quiet. ",
        "3. Raise at most 2-3 cards with attention.raise: type 'do' with a concrete next step, or 'notify' for an FYI. Anchor to a project (projectRef 'projects:<id>') when relevant. Dedupe per ISO week: dedupeKey 'looseend:<slug>:<YYYY-Wxx>'.",
        "4. Do not repeat what the project-pulse already flags (stalled projects) unless you're adding a concrete action. Keep it minimal.",
      ].join("\n"),
      defaultTools: [
        "projects.list",
        "tasks.list",
        "people.list",
        "attention.raise",
        "attention.list",
      ],
      defaultSchedule: "0 8 * * 1,4", // Mon & Thu mornings
      defaultProvider: "ollama",
      defaultModel: "qwen3-coder:30b",
    },
    {
      id: "weekly-reviewer",
      name: "Weekly reviewer",
      description:
        "Friday synthesis: what moved this week, what's slipping, and 2-3 priorities for next week — as one review card. Runs on a free local synthesis model.",
      defaultPrompt: [
        "You are the user's chief-of-staff writing their weekly review. Synthesize — don't just list.",
        "1. Gather: projects.list (health + progress), tasks.list (done vs open, overdue), people.list (who you met, who's gone quiet), attention.list (what's still open).",
        "2. Write a tight review: (a) what actually moved, (b) what's slipping or blocked, (c) 2-3 concrete priorities for next week. A few short paragraphs, specific, no filler.",
        "3. Raise exactly ONE card with attention.raise: type 'review', title 'Weekly review — <this week's Monday date>', the synthesis in the body, urgency 10, dedupeKey 'weekly:<YYYY-Wxx>'.",
        "4. Also call memory.remember to store the 2-3 priorities as a durable note so next week's agents know the focus.",
      ].join("\n"),
      defaultTools: [
        "projects.list",
        "tasks.list",
        "people.list",
        "attention.list",
        "attention.raise",
      ],
      defaultSchedule: "0 16 * * 5", // Friday 16:00
      // The one heavier synthesis job — still FREE and local.
      defaultProvider: "ollama",
      defaultModel: "gemma4:31b-it-qat",
    },
  ],
};
