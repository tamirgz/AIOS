import { getSetting, SETTING_KEYS } from "@/core/app-settings";
import { AuthPanel } from "../components/AuthPanel";
import { IntegrationsEditor } from "../components/IntegrationsEditor";
import { SettingsNav } from "../components/SettingsNav";

/** Settings · Connections — subscription auth + external integrations. */
export async function ConnectionsPage() {
  const [
    icsUrl,
    slackWebhook,
    obsidianPath,
    googleClientId,
    googleClientSecret,
    googleRefreshToken,
    slackBotToken,
    slackReportChannels,
    slackInboxChannels,
    geminiApiKey,
    searxngUrl,
    askWebSearch,
    readerProxyUrl,
    mlxBaseUrl,
    mlxModels,
  ] = await Promise.all([
    getSetting(SETTING_KEYS.calendarIcsUrl),
    getSetting(SETTING_KEYS.slackWebhookUrl),
    getSetting("obsidian_vault_path"),
    getSetting("google_client_id"),
    getSetting("google_client_secret"),
    getSetting("google_refresh_token"),
    getSetting("slack_bot_token"),
    getSetting("slack_report_channels"),
    getSetting("slack_inbox_channels"),
    getSetting("gemini_api_key"),
    getSetting("searxng_url"),
    getSetting("ask_web_search"),
    getSetting("reader_proxy_url"),
    getSetting("mlx_base_url"),
    getSetting("mlx_models"),
  ]);

  return (
    <div className="max-w-3xl">
      <SettingsNav />
      <div className="flex flex-col gap-5">
        <AuthPanel />
        <IntegrationsEditor
          icsUrl={icsUrl ?? ""}
          slackWebhook={slackWebhook ?? ""}
          obsidianPath={obsidianPath ?? ""}
          googleClientId={googleClientId ?? ""}
          googleClientSecret={googleClientSecret ?? ""}
          googleConnected={!!googleRefreshToken}
          slackBotToken={slackBotToken ?? ""}
          geminiApiKey={geminiApiKey ?? ""}
          slackReportChannels={slackReportChannels ?? ""}
          slackInboxChannels={slackInboxChannels ?? ""}
          searxngUrl={searxngUrl ?? ""}
          webSearchOn={askWebSearch !== "off"}
          readerProxyUrl={readerProxyUrl ?? ""}
          mlxBaseUrl={mlxBaseUrl ?? ""}
          mlxModels={mlxModels ?? ""}
        />
      </div>
    </div>
  );
}
