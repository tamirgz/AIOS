import { listKnowledge } from "../actions";
import { KnowledgeBoard } from "../components/KnowledgeBoard";

export async function KnowledgePage() {
  const items = await listKnowledge();
  return <KnowledgeBoard items={items} />;
}
