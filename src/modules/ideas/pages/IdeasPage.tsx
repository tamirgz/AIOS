import { listIdeas } from "../actions";
import { IdeasBoard } from "../components/IdeasBoard";

export async function IdeasPage() {
  const items = await listIdeas();
  return <IdeasBoard items={items} />;
}
