import { listContent } from "../actions";
import { ContentBoard } from "../components/ContentBoard";

export async function ContentPage() {
  const items = await listContent();
  return <ContentBoard items={items} />;
}
