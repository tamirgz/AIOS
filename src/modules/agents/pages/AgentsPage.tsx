import { serverModules } from "@/modules/registry.server";
import { AgentsList } from "../components/AgentsList";
import { listAgentsWithLatestRun } from "../queries";

export async function AgentsPage() {
  const items = await listAgentsWithLatestRun();
  const templates = serverModules.flatMap((m) =>
    m.agentTemplates.map((t) => ({ ...t, moduleId: m.id })),
  );
  return <AgentsList items={items} templates={templates} />;
}
