import { asc } from "drizzle-orm";
import { db } from "@/core/db/client";
import { aiRoutes } from "@/core/db/schema/ai-routes";
import { ensureDefaultRoutes } from "@/core/ai/routing";
import { getSetting, SETTING_KEYS } from "@/core/app-settings";
import { listMemoryBlocks } from "@/core/memory";
import { RoutesEditor } from "../components/RoutesEditor";
import { IntegrationsEditor } from "../components/IntegrationsEditor";
import { MemoryEditor } from "../components/MemoryEditor";

export async function SettingsPage() {
  await ensureDefaultRoutes();
  const [routes, icsUrl, slackWebhook, memory] = await Promise.all([
    db.select().from(aiRoutes).orderBy(asc(aiRoutes.taskKey)),
    getSetting(SETTING_KEYS.calendarIcsUrl),
    getSetting(SETTING_KEYS.slackWebhookUrl),
    listMemoryBlocks(),
  ]);

  return (
    <div className="max-w-3xl">
      <RoutesEditor routes={routes} />
      <MemoryEditor blocks={memory} />
      <IntegrationsEditor
        icsUrl={icsUrl ?? ""}
        slackWebhook={slackWebhook ?? ""}
      />
    </div>
  );
}
