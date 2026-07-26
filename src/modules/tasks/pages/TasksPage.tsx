import { listProjects } from "@/modules/projects/actions";
import { listTasks } from "../actions";
import { TaskBoard } from "../components/TaskBoard";

export async function TasksPage() {
  const [tasks, projects] = await Promise.all([listTasks(), listProjects()]);
  const projectOptions = projects.map((p) => ({ id: p.id, name: p.name }));
  return <TaskBoard tasks={tasks} projectOptions={projectOptions} />;
}
