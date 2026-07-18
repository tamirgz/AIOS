import { asc, eq } from "drizzle-orm";
import { db } from "@/core/db/client";
import { approvals } from "@/core/db/schema/approvals";
import { serverModules } from "@/modules/registry.server";
import { AgentsList } from "../components/AgentsList";
import { ApprovalsPanel } from "../components/ApprovalsPanel";
import { listAgentsWithLatestRun } from "../queries";

export async function AgentsPage() {
  const [items, pending] = await Promise.all([
    listAgentsWithLatestRun(),
    db
      .select()
      .from(approvals)
      .where(eq(approvals.status, "pending"))
      .orderBy(asc(approvals.createdAt)),
  ]);
  const templates = serverModules.flatMap((m) =>
    m.agentTemplates.map((t) => ({ ...t, moduleId: m.id })),
  );
  return (
    <>
      <ApprovalsPanel pending={pending} />
      <AgentsList items={items} templates={templates} />
    </>
  );
}
