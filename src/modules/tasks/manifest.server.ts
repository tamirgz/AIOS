import type { ModuleServerManifest } from "@/core/modules/types.server";
import { tasks } from "./schema";
import { taskTools } from "./tools";
import { TasksPage } from "./pages/TasksPage";
import { OpenTasksWidget } from "./widgets/OpenTasksWidget";
import { UpNextWidget } from "./widgets/UpNextWidget";

export const tasksServerManifest: ModuleServerManifest = {
  id: "tasks",
  routes: {
    "": TasksPage,
  },
  widgets: [
    {
      id: "open-tasks",
      title: "Task load",
      size: "sm",
      component: OpenTasksWidget,
    },
    { id: "up-next", title: "Up next", size: "md", component: UpNextWidget },
  ],
  schema: { tasks },
  aiTools: taskTools,
  agentTemplates: [
    {
      id: "task-triage",
      name: "Task triage",
      description:
        "Reviews open tasks daily, flags stale or overdue ones by raising their priority.",
      defaultPrompt:
        "Review my open tasks with tasks.list. For any task that looks stale or overdue, raise its priority with tasks.setStatus/tasks.list data and summarize what most needs attention today. Use the ledger to avoid re-flagging tasks you already flagged.",
      defaultTools: ["tasks.list", "tasks.setStatus"],
      defaultSchedule: "0 8 * * *",
    },
  ],
};
