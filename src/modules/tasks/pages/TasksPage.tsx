import { listTasks } from "../actions";
import { TaskBoard } from "../components/TaskBoard";

export async function TasksPage() {
  const tasks = await listTasks();
  return <TaskBoard tasks={tasks} />;
}
