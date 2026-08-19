/**
 * Local model-server health check. Pings the servers apOS depends on — Ollama
 * (always; embeddings + local reasoning) and LM Studio / MLX (only when its
 * endpoint is configured) — and, on a state CHANGE, raises a notification
 * (bell + Slack) so a down server doesn't fail silently.
 *
 * Runs on an interval from the worker (`healthcheck_interval_min`, default 60,
 * 0 = off) and on-demand from Settings → Connections ("Check now"). Idempotent:
 * the last-known status per server is persisted in `healthcheck_state`, so we
 * alert only on a transition (up→down) or recovery (down→up), never every tick.
 */
import { getSetting, setSetting } from "@/core/app-settings";
import { notify } from "@/core/notify";

export const HEALTHCHECK_INTERVAL_KEY = "healthcheck_interval_min";
export const HEALTHCHECK_STATE_KEY = "healthcheck_state";
export const HEALTHCHECK_LAST_KEY = "healthcheck_last";
export const DEFAULT_HEALTHCHECK_INTERVAL_MIN = 60;

export interface ServerStatus {
  id: "ollama" | "mlx";
  label: string;
  url: string;
  ok: boolean;
}

async function reachable(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    return res.ok;
  } catch {
    return false;
  }
}

/** Ping the model servers apOS expects to be up. MLX is only checked when its
 *  endpoint is configured (otherwise it's an opt-in that isn't expected to run). */
export async function checkModelServers(): Promise<ServerStatus[]> {
  const ollamaBase = (
    process.env.OLLAMA_BASE_URL ?? "http://localhost:11434"
  ).replace(/\/$/, "");
  const out: ServerStatus[] = [
    {
      id: "ollama",
      label: "Ollama",
      url: ollamaBase,
      ok: await reachable(`${ollamaBase}/api/tags`),
    },
  ];

  const mlxBase = (
    (await getSetting("mlx_base_url")) ||
    process.env.MLX_BASE_URL ||
    ""
  ).replace(/\/$/, "");
  if (mlxBase) {
    out.push({
      id: "mlx",
      label: "LM Studio (MLX)",
      url: mlxBase,
      ok: await reachable(`${mlxBase}/models`),
    });
  }
  return out;
}

/** Check, then notify on any status TRANSITION, and persist the new state.
 *  Returns the current statuses (for the caller to display/log). */
export async function runHealthCheckAndNotify(): Promise<ServerStatus[]> {
  const statuses = await checkModelServers();

  let prev: Record<string, boolean> = {};
  try {
    prev = JSON.parse((await getSetting(HEALTHCHECK_STATE_KEY)) || "{}");
  } catch {
    prev = {};
  }

  const next: Record<string, boolean> = {};
  for (const s of statuses) {
    next[s.id] = s.ok;
    const was = prev[s.id];
    if (!s.ok && was !== false) {
      // up (or unknown) → down
      await notify({
        title: `${s.label} is unreachable`,
        body: `apOS can't reach ${s.label} at ${s.url}. Local search, chat, and agents will fail until it's back. If it's running, make sure it listens on all interfaces (OLLAMA_HOST=0.0.0.0).`,
        level: "warn",
        source: "health",
        href: "/m/settings/connections",
      });
    } else if (s.ok && was === false) {
      // down → up
      await notify({
        title: `${s.label} is back`,
        body: `${s.label} is reachable again.`,
        level: "success",
        source: "health",
      });
    }
  }

  await setSetting(HEALTHCHECK_STATE_KEY, JSON.stringify(next));
  await setSetting(HEALTHCHECK_LAST_KEY, String(Date.now()));
  return statuses;
}
