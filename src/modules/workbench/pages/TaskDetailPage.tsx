import { notFound } from "next/navigation";
import type { ModuleRouteProps } from "@/core/modules/types.server";
import { getTaskDetail } from "../queries";
import { TaskDetailView } from "../components/TaskDetail";

export async function TaskDetailPage({ params }: ModuleRouteProps) {
  const detail = await getTaskDetail(params[0]);
  if (!detail) notFound();
  return <TaskDetailView detail={detail} />;
}
