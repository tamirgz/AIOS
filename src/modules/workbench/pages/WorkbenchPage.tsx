import { listExecutors, listTasks } from "../queries";
import { listFreeModelsByExecutor } from "../models";
import { NewTaskBox } from "../components/NewTaskBox";
import { TaskBoard } from "../components/TaskBoard";
import { ArchivedTasks } from "../components/ArchivedTasks";

export async function WorkbenchPage() {
  const [tasks, archived, executors] = await Promise.all([
    listTasks(),
    listTasks(true),
    listExecutors(),
  ]);
  // Free models per executor — opencode gets its cloud free tier too.
  const freeModels = await listFreeModelsByExecutor(executors.map((x) => x.id));
  return (
    <div>
      {/* The repo you work in most is the sane default for code tasks. */}
      <NewTaskBox
        defaultRepo={process.cwd()}
        executors={executors}
        freeModels={freeModels}
      />
      <TaskBoard tasks={tasks} />
      <ArchivedTasks tasks={archived} />
    </div>
  );
}
