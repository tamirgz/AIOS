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
]);

export async function saveMemoryBlock(label: string, value: string) {
  const { updateMemoryBlock } = await import("@/core/memory");
  await updateMemoryBlock(label, value, "replace");
  revalidatePath("/m/settings");
}

export async function saveIntegration(key: string, value: string) {
  if (!ALLOWED_INTEGRATION_KEYS.has(key)) throw new Error("unknown setting");
  await setSetting(key, value.trim());
  if (key === "calendar_ics_url" && value.trim()) {
    await sql.notify("calendar_sync", "settings-changed");
  }
  if (key === "obsidian_vault_path" && value.trim()) {
    await sql.notify("obsidian_sync", "settings-changed");
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
