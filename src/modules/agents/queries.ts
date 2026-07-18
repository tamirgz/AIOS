import { desc, eq, sql as dsql } from "drizzle-orm";
import { db } from "@/core/db/client";
import {
  agentRuns,
  agents,
  type Agent,
  type AgentRun,
} from "@/core/db/schema/agents";

export interface AgentWithLatestRun {
  agent: Agent;
  latestRun: AgentRun | null;
}

export async function listAgentsWithLatestRun(): Promise<AgentWithLatestRun[]> {
  const all = await db.select().from(agents).orderBy(desc(agents.createdAt));
  const results: AgentWithLatestRun[] = [];
  for (const agent of all) {
    const [latestRun] = await db
      .select()
      .from(agentRuns)
      .where(eq(agentRuns.agentId, agent.id))
      .orderBy(desc(agentRuns.createdAt))
      .limit(1);
    results.push({ agent, latestRun: latestRun ?? null });
  }
  return results;
}

export async function getAgent(id: string): Promise<Agent | null> {
  const [row] = await db.select().from(agents).where(eq(agents.id, id));
  return row ?? null;
}

export async function listRuns(agentId: string, limit = 20) {
  return db
    .select()
    .from(agentRuns)
    .where(eq(agentRuns.agentId, agentId))
    .orderBy(desc(agentRuns.createdAt))
    .limit(limit);
}

export async function listRecentRunsAcrossAgents(limit = 5) {
  return db
    .select({
      run: agentRuns,
      agentName: dsql<string>`(select ${agents.name} from ${agents} where ${agents.id} = ${agentRuns.agentId})`,
    })
    .from(agentRuns)
    .orderBy(desc(agentRuns.createdAt))
    .limit(limit);
}
