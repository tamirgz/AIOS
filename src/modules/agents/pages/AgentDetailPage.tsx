import type { ModuleRouteProps } from "@/core/modules/types.server";
import { getAllTools } from "@/core/ai/tool-registry";
import { GlassPanel } from "@/core/ui/GlassPanel";
import { AgentDetail } from "../components/AgentDetail";
import { getAgent, listRuns } from "../queries";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function AgentDetailPage({ params }: ModuleRouteProps) {
  const id = params[0];
  const agent = UUID_RE.test(id) ? await getAgent(id) : null;

  if (!agent) {
    return (
      <GlassPanel className="px-8 py-16 text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.35em] text-flare">
          agent not found
        </p>
      </GlassPanel>
    );
  }

  const runs = await listRuns(agent.id);
  const allTools = getAllTools().map((t) => t.name);
  return <AgentDetail agent={agent} runs={runs} allTools={allTools} />;
}
