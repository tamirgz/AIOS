import { asc } from "drizzle-orm";
import { db } from "@/core/db/client";
import { aiRoutes } from "@/core/db/schema/ai-routes";
import { ensureDefaultRoutes } from "@/core/ai/routing";
import { getSetting } from "@/core/app-settings";
import { DEFAULT_EMBEDDING_MODEL, EMBEDDING_MODEL_KEY } from "@/core/embeddings";
import { RoutesEditor } from "../components/RoutesEditor";
import { AgentModelsPanel } from "@/modules/agents/components/AgentModelsPanel";
import { EmbeddingModelPicker } from "../components/EmbeddingModelPicker";
import { ExecutorsPanel } from "@/modules/workbench/components/ExecutorsPanel";
import { listExecutors } from "@/modules/workbench/queries";
import {
  getFreeModelHealthSummary,
  listFreeModelsByExecutor,
} from "@/modules/workbench/models";
import { SettingsNav } from "../components/SettingsNav";

/** Settings · Models & Routing — every model/provider/executor choice. */
export async function ModelsPage() {
  await ensureDefaultRoutes();
  const [routes, embeddingModel] = await Promise.all([
    db.select().from(aiRoutes).orderBy(asc(aiRoutes.taskKey)),
    getSetting(EMBEDDING_MODEL_KEY),
  ]);
  const workbenchExecutors = await listExecutors();
  const freeModelsByExecutor = await listFreeModelsByExecutor(
    workbenchExecutors.map((x) => x.id),
  );
  const freeModelHealth = await getFreeModelHealthSummary();

  const { agents } = await import("@/core/db/schema/agents");
  const agentRows = await db
    .select({
      id: agents.id,
      name: agents.name,
      schedule: agents.schedule,
      enabled: agents.enabled,
      provider: agents.provider,
      model: agents.model,
    })
    .from(agents)
    .orderBy(asc(agents.name));

  return (
    <div className="max-w-6xl">
      <SettingsNav />
      <div className="grid grid-cols-1 gap-x-6 gap-y-5 xl:grid-cols-2">
        <div className="flex flex-col gap-5">
          <RoutesEditor routes={routes} />
          <AgentModelsPanel agents={agentRows} />
        </div>
        <div className="flex flex-col gap-5">
          <EmbeddingModelPicker
            initial={embeddingModel ?? DEFAULT_EMBEDDING_MODEL}
          />
          <ExecutorsPanel
            executors={workbenchExecutors}
            modelsByExecutor={freeModelsByExecutor}
            freeModelHealth={freeModelHealth}
          />
        </div>
      </div>
    </div>
  );
}
