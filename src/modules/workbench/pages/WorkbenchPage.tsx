import { listExecutors, listTasks } from "../queries";
import { NewTaskBox } from "../components/NewTaskBox";
import { TaskBoard } from "../components/TaskBoard";
import { ArchivedTasks } from "../components/ArchivedTasks";

export async function WorkbenchPage() {
  const [tasks, archived, executors] = await Promise.all([
    listTasks(),
    listTasks(true),
    listExecutors(),
  ]);
  return (
    <div>
      {/* The repo you work in most is the sane default for code tasks. */}
      <NewTaskBox defaultRepo={process.cwd()} executors={executors} />
      <TaskBoard tasks={tasks} />
      <ArchivedTasks tasks={archived} />
    </div>
  );
}
