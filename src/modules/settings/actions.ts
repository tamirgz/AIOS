"use server";

import { revalidatePath } from "next/cache";
import { setRoute } from "@/core/ai/routing";
import { getSetting, setSetting } from "@/core/app-settings";
import { sql } from "@/core/db/client";
import type { AIProviderId } from "@/core/db/schema/ai-routes";
import { INTEGRATION_SETTING_KEYS } from "@/core/integrations/registry";
import { THEME_IDS } from "@/core/theme";

// Generated from the integration registry, so every field the Connections UI
// renders is saveable by construction. Plus a few non-connection settings that
// also go through saveIntegration (e.g. the embedding model, set on the Models
// page).
const ALLOWED_INTEGRATION_KEYS = new Set([
  ...INTEGRATION_SETTING_KEYS,
  "embedding_model",
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

export async function createMemoryBlock(label: string, description: string) {
  const { createMemoryBlockDef } = await import("@/core/memory");
  await createMemoryBlockDef(label, description);
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

/** Persist the selected appearance theme (applied as <html data-theme>). */
export async function saveTheme(id: string) {
  if (!THEME_IDS.includes(id)) throw new Error("unknown theme");
  await setSetting("theme", id);
  // Re-render the root layout so the SSR data-theme matches on next load.
  revalidatePath("/", "layout");
}

// ── Local one-click auto-detect (B2) ─────────────────────────────────────────

/** Read Obsidian's own vault registry and return the vaults that still exist. */
export async function detectObsidianVaults(): Promise<
  { path: string; name: string }[]
> {
  const { homedir } = await import("node:os");
  const { readFile } = await import("node:fs/promises");
  const { existsSync } = await import("node:fs");
  const { basename, join } = await import("node:path");
  const cfg = join(
    homedir(),
    "Library",
    "Application Support",
    "obsidian",
    "obsidian.json",
  );
  try {
    const json = JSON.parse(await readFile(cfg, "utf8")) as {
      vaults?: Record<string, { path?: string }>;
    };
    const seen = new Set<string>();
    return Object.values(json.vaults ?? {})
      .map((v) => v.path)
      .filter((p): p is string => !!p && existsSync(p) && !seen.has(p) && (seen.add(p), true))
      .map((p) => ({ path: p, name: basename(p) }));
  } catch {
    return [];
  }
}

/** Point the Obsidian integration at a detected vault (reuses save's cleanup +
 *  the obsidian_sync NOTIFY). */
export async function useObsidianVault(path: string) {
  await saveIntegration("obsidian_vault_path", path);
}

/** Probe a running LM Studio server; on success, save its endpoint + model list
 *  so the `mlx` provider is wired with one click. Embedding models are skipped
 *  (they belong to Ollama). */
export async function detectMlx(): Promise<{
  ok: boolean;
  models: number;
  baseUrl?: string;
}> {
  const base = (
    (await getSetting("mlx_base_url")) ||
    process.env.MLX_BASE_URL ||
    "http://localhost:1234/v1"
  ).replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/models`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return { ok: false, models: 0 };
    const data = (await res.json()) as { data?: { id: string }[] };
    const ids = (data.data ?? [])
      .map((m) => m.id)
      .filter((id) => !/embed/i.test(id));
    await setSetting("mlx_base_url", base);
    if (ids.length) await setSetting("mlx_models", ids.join(", "));
    revalidatePath("/m/settings");
    return { ok: true, models: ids.length, baseUrl: base };
  } catch {
    return { ok: false, models: 0 };
  }
}

/** List the Slack channels the bot can see, for the channel picker (replaces
 *  pasting comma-separated IDs). Needs channels:read / groups:read on the token. */
export async function listSlackChannels(): Promise<{
  ok: boolean;
  error?: string;
  channels?: { id: string; name: string; member: boolean }[];
}> {
  const token = (await getSetting("slack_bot_token"))?.trim();
  if (!token) return { ok: false, error: "add a bot token first" };
  try {
    const { slackApi } = await import("@/modules/agents/slack-intake");
    const data = await slackApi<{
      channels: { id: string; name: string; is_member: boolean }[];
    }>(token, "conversations.list", {
      types: "public_channel,private_channel",
      exclude_archived: "true",
      limit: "1000",
    });
    const channels = (data.channels ?? [])
      .map((c) => ({ id: c.id, name: c.name, member: c.is_member }))
      .sort((a, b) => Number(b.member) - Number(a.member) || a.name.localeCompare(b.name));
    return { ok: true, channels };
  } catch (e) {
    const msg = String(e);
    if (/missing_scope/.test(msg))
      return {
        ok: false,
        error:
          "the bot lacks channels:read / groups:read — re-install the app with the manifest above",
      };
    return { ok: false, error: msg.replace(/^Error:\s*/, "") };
  }
}
