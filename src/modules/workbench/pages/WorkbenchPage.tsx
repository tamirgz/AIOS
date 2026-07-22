import { listTasks } from "../queries";
import { NewTaskBox } from "../components/NewTaskBox";
import { TaskBoard } from "../components/TaskBoard";
import { ArchivedTasks } from "../components/ArchivedTasks";

export async function WorkbenchPage() {
  const [tasks, archived] = await Promise.all([listTasks(), listTasks(true)]);
  return (
    <div>
      {/* The repo you work in most is the sane default for code tasks. */}
      <NewTaskBox defaultRepo={process.cwd()} />
      <TaskBoard tasks={tasks} />
      <ArchivedTasks tasks={archived} />
    </div>
  );
}
