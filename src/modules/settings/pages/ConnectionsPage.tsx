import { getSetting } from "@/core/app-settings";
import { INTEGRATIONS } from "@/core/integrations/registry";
import { AuthPanel } from "../components/AuthPanel";
import { IntegrationsEditor } from "../components/IntegrationsEditor";
import { SettingsNav } from "../components/SettingsNav";

/** Settings · Connections — subscription auth + external integrations. */
export async function ConnectionsPage() {
  // Load every registry field's current value in one pass, so the editor renders
  // entirely from the registry (no per-key prop plumbing).
  const keys = [...new Set(INTEGRATIONS.flatMap((i) => i.fields.map((f) => f.key)))];
  const entries = await Promise.all(
    keys.map(async (k) => [k, (await getSetting(k)) ?? ""] as const),
  );
  const values = Object.fromEntries(entries);
  const googleConnected = !!(await getSetting("google_refresh_token"));

  return (
    <div className="max-w-3xl">
      <SettingsNav />
      <div className="flex flex-col gap-5">
        <AuthPanel />
        <IntegrationsEditor values={values} googleConnected={googleConnected} />
      </div>
    </div>
  );
}
