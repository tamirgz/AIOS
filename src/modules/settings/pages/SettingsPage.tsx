import { asc } from "drizzle-orm";
import { db } from "@/core/db/client";
import { aiRoutes } from "@/core/db/schema/ai-routes";
import { ensureDefaultRoutes } from "@/core/ai/routing";
import { getSetting, SETTING_KEYS } from "@/core/app-settings";
import { RoutesEditor } from "../components/RoutesEditor";
import { IntegrationsEditor } from "../components/IntegrationsEditor";

export async function SettingsPage() {
  await ensureDefaultRoutes();
  const [routes, icsUrl, slackWebhook] = await Promise.all([
    db.select().from(aiRoutes).orderBy(asc(aiRoutes.taskKey)),
    getSetting(SETTING_KEYS.calendarIcsUrl),
    getSetting(SETTING_KEYS.slackWebhookUrl),
  ]);

  return (
    <div className="max-w-3xl">
      <RoutesEditor routes={routes} />
      <IntegrationsEditor
        icsUrl={icsUrl ?? ""}
        slackWebhook={slackWebhook ?? ""}
      />
    </div>
  );
}
