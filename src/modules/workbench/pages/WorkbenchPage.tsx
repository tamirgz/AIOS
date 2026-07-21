import { listTasks } from "../queries";
import { NewTaskBox } from "../components/NewTaskBox";
import { TaskBoard } from "../components/TaskBoard";

export async function WorkbenchPage() {
  const tasks = await listTasks();
  return (
    <div>
      {/* The repo you work in most is the sane default for code tasks. */}
      <NewTaskBox defaultRepo={process.cwd()} />
      <TaskBoard tasks={tasks} />
    </div>
  );
}
