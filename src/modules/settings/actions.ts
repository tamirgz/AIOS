"use server";

import { revalidatePath } from "next/cache";
import { setRoute } from "@/core/ai/routing";
import { setSetting } from "@/core/app-settings";
import { sql } from "@/core/db/client";
import type { AIProviderId } from "@/core/db/schema/ai-routes";

const ALLOWED_INTEGRATION_KEYS = new Set([
  "slack_webhook_url",
  "calendar_ics_url",
  "obsidian_vault_path",
  "embedding_model",
  "google_client_id",
  "google_client_secret",
  "slack_bot_token",
  "slack_report_channels",
]);

export async function disconnectGoogle() {
  const { db } = await import("@/core/db/client");
  const { appSettings } = await import("@/core/db/schema/app-settings");
  const { eq } = await import("drizzle-orm");
  await db
    .delete(appSettings)
    .where(eq(appSettings.key, "google_refresh_token"));
  revalidatePath("/m/settings");
}

export async function saveMemoryBlock(label: string, value: string) {
  const { updateMemoryBlock } = await import("@/core/memory");
  await updateMemoryBlock(label, value, "replace");
  revalidatePath("/m/settings");
}

export async function saveIntegration(key: string, value: string) {
  if (!ALLOWED_INTEGRATION_KEYS.has(key)) throw new Error("unknown setting");
  let cleaned = value.trim();
  if (key === "obsidian_vault_path") {
    // Users paste shell-quoted paths ('/My Drive/…') — strip wrapping quotes,
    // expand ~, drop trailing slash.
    cleaned = cleaned
      .replace(/^['"]+/, "")
      .replace(/['"]+$/, "")
      .replace(/\/+$/, "");
    if (cleaned.startsWith("~/")) {
      const { homedir } = await import("node:os");
      cleaned = homedir() + cleaned.slice(1);
    }
  }
  await setSetting(key, cleaned);
  if (key === "calendar_ics_url" && value.trim()) {
    await sql.notify("calendar_sync", "settings-changed");
  }
  if (key === "obsidian_vault_path" && value.trim()) {
    await sql.notify("obsidian_sync", "settings-changed");
  }
  if (key === "slack_report_channels" && value.trim()) {
    // New channel list → re-read recent history, then poll.
    const { backfillSlack } = await import("@/modules/agents/slack-intake");
    await backfillSlack();
    await sql.notify("slack_intake", "settings-changed");
  }
  revalidatePath("/m/settings");
}

export async function saveRoute(
  taskKey: string,
  provider: AIProviderId,
  model: string,
) {
  if (!model.trim()) throw new Error("model is required");
  await setRoute(taskKey, provider, model);
  revalidatePath("/m/settings");
}
