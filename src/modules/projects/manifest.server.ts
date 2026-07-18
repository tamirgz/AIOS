import type { ModuleServerManifest } from "@/core/modules/types.server";
import { projects } from "./schema";
import { projectTools } from "./tools";
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
  schema: { projects },
  aiTools: projectTools,
  agentTemplates: [
    {
      id: "project-pulse",
      name: "Project pulse",
      description:
        "Weekly review of project progress; summarizes stalled projects.",
      defaultPrompt:
        "Use projects.list to review all projects. Identify stalled ones (few done tasks, old updates) and produce a short status pulse. Use the ledger to avoid repeating identical findings.",
      defaultTools: ["projects.list", "tasks.list"],
      defaultSchedule: "0 9 * * 1",
    },
  ],
};
