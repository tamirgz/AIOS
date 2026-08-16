import { notFound } from "next/navigation";
import type { ModuleRouteProps } from "@/core/modules/types.server";
import { listProjectOptions } from "@/modules/projects/queries";
import { getTaskDetail } from "../queries";
import { TaskDetailView } from "../components/TaskDetail";

export async function TaskDetailPage({ params }: ModuleRouteProps) {
  const [detail, projectOptions] = await Promise.all([
    getTaskDetail(params[0]),
    listProjectOptions(),
  ]);
  if (!detail) notFound();
  return <TaskDetailView detail={detail} projectOptions={projectOptions} />;
}
