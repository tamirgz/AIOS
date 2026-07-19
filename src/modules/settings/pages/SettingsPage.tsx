import { asc } from "drizzle-orm";
import { db } from "@/core/db/client";
import { aiRoutes } from "@/core/db/schema/ai-routes";
import { ensureDefaultRoutes } from "@/core/ai/routing";
import { getSetting, SETTING_KEYS } from "@/core/app-settings";
import { listMemoryBlocks } from "@/core/memory";
import { DEFAULT_EMBEDDING_MODEL, EMBEDDING_MODEL_KEY } from "@/core/embeddings";
import { RoutesEditor } from "../components/RoutesEditor";
import { IntegrationsEditor } from "../components/IntegrationsEditor";
import { MemoryEditor } from "../components/MemoryEditor";
import { UsagePanel } from "../components/UsagePanel";
import { EmbeddingModelPicker } from "../components/EmbeddingModelPicker";

export async function SettingsPage() {
  await ensureDefaultRoutes();
  const [routes, icsUrl, slackWebhook, obsidianPath, embeddingModel, memory] =
    await Promise.all([
      db.select().from(aiRoutes).orderBy(asc(aiRoutes.taskKey)),
      getSetting(SETTING_KEYS.calendarIcsUrl),
      getSetting(SETTING_KEYS.slackWebhookUrl),
      getSetting("obsidian_vault_path"),
      getSetting(EMBEDDING_MODEL_KEY),
      // Memory being unavailable must not take the whole page down.
      listMemoryBlocks().catch(() => []),
    ]);

  return (
    <div className="grid max-w-6xl grid-cols-1 gap-x-6 gap-y-5 xl:grid-cols-2">
      <div className="flex flex-col gap-5">
        <RoutesEditor routes={routes} />
        <EmbeddingModelPicker
          initial={embeddingModel ?? DEFAULT_EMBEDDING_MODEL}
        />
        <IntegrationsEditor
          icsUrl={icsUrl ?? ""}
          slackWebhook={slackWebhook ?? ""}
          obsidianPath={obsidianPath ?? ""}
        />
      </div>
      <div className="flex flex-col gap-5">
        <MemoryEditor blocks={memory} />
        <UsagePanel />
      </div>
    </div>
  );
}
