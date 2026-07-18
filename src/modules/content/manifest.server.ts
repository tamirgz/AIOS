import type { ModuleServerManifest } from "@/core/modules/types.server";
import { contentItems } from "./schema";
import { contentTools } from "./tools";
import { ContentPage } from "./pages/ContentPage";
import { PipelineWidget } from "./widgets/PipelineWidget";
import { UpcomingWidget } from "./widgets/UpcomingWidget";

export const contentServerManifest: ModuleServerManifest = {
  id: "content",
  routes: {
    "": ContentPage,
  },
  widgets: [
    {
      id: "pipeline",
      title: "Pipeline",
      size: "sm",
      component: PipelineWidget,
    },
    {
      id: "upcoming",
      title: "Upcoming",
      size: "md",
      component: UpcomingWidget,
    },
  ],
  schema: { contentItems },
  aiTools: contentTools,
  agentTemplates: [
    {
      id: "content-digest",
      name: "Content pipeline digest",
      description:
        "Daily digest of pipeline state and upcoming publish dates.",
      defaultPrompt:
        "Use content.list to inspect the pipeline. Summarize what is due to publish soon and what is stuck in review. Use the ledger to avoid re-reporting identical states.",
      defaultTools: ["content.list"],
      defaultSchedule: "0 9 * * *",
    },
  ],
};
