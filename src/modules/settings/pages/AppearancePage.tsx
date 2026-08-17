import { getSetting } from "@/core/app-settings";
import { DEFAULT_THEME } from "@/core/theme";
import { ThemePicker } from "../components/ThemePicker";
import { SettingsNav } from "../components/SettingsNav";

/** Settings · Appearance — pick the app's theme. */
export async function AppearancePage() {
  const current = (await getSetting("theme").catch(() => null)) || DEFAULT_THEME;
  return (
    <div className="max-w-4xl">
      <SettingsNav />
      <ThemePicker current={current} />
    </div>
  );
}
