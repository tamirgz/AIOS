import { eq } from "drizzle-orm";
import { db } from "@/core/db/client";
import { appSettings } from "@/core/db/schema/app-settings";

export const SETTING_KEYS = {
  slackWebhookUrl: "slack_webhook_url",
  calendarIcsUrl: "calendar_ics_url",
} as const;

export async function getSetting(key: string): Promise<string | null> {
  const [row] = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.key, key));
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string) {
  await db
    .insert(appSettings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value, updatedAt: new Date() },
    });
}
