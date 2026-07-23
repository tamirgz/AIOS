import { listExecutors, listTasks } from "../queries";
import { listFreeModels } from "../models";
import { NewTaskBox } from "../components/NewTaskBox";
import { TaskBoard } from "../components/TaskBoard";
import { ArchivedTasks } from "../components/ArchivedTasks";

export async function WorkbenchPage() {
  const [tasks, archived, executors, freeModels] = await Promise.all([
    listTasks(),
    listTasks(true),
    listExecutors(),
    listFreeModels(),
  ]);
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
