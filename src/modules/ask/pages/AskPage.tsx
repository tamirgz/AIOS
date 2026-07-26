import { listAskHistory } from "../actions";
import { AskConsole } from "../components/AskConsole";

export async function AskPage() {
  const history = await listAskHistory();
  return <AskConsole initialHistory={history} />;
}
