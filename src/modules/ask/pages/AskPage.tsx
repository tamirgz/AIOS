import { listAskHistory } from "../actions";
import { listProjectOptions } from "@/modules/projects/queries";
import { AskConsole } from "../components/AskConsole";

export async function AskPage() {
  const [history, projectOptions] = await Promise.all([
    listAskHistory(),
    listProjectOptions(),
  ]);
  return <AskConsole initialHistory={history} projectOptions={projectOptions} />;
}
