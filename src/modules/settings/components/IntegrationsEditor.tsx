"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { cn } from "@/core/ui/cn";
import { saveIntegration } from "../actions";
import { GoogleConnect } from "./GoogleConnect";

function IntegrationField({
  settingKey,
  label,
  hint,
  placeholder,
  initial,
  secret = true,
}: {
  settingKey: string;
  label: string;
  hint: string;
  placeholder: string;
  initial: string;
  secret?: boolean;
}) {
  const [value, setValue] = useState(initial);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const dirty = value !== initial || (value !== "" && !saved && value === initial);

  return (
    <div className="glass rounded-xl p-3">
      <p className="text-sm text-ink">
        {label}{" "}
        <span className="font-mono text-[9px] uppercase tracking-widest text-ink-faint">
          {settingKey}
        </span>
      </p>
      <p className="mb-2 text-xs leading-snug text-ink-dim">{hint}</p>
      <div className="flex gap-2">
        <input
          type={secret ? "password" : "text"}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setSaved(false);
          }}
          placeholder={placeholder}
          className="h-9 flex-1 rounded-lg border border-white/10 bg-abyss px-3 font-mono text-xs text-ink outline-none focus:border-plasma/40"
        />
        <button
          type="button"
          disabled={pending || !dirty}
          onClick={() =>
            startTransition(async () => {
              await saveIntegration(settingKey, value);
              setSaved(true);
            })
          }
          className={cn(
            "flex h-9 items-center gap-1.5 rounded-lg px-4 font-mono text-[11px] uppercase tracking-widest transition",
            dirty && !saved
              ? "bg-plasma/15 text-plasma hover:bg-plasma/25"
              : "border border-white/8 text-ink-faint",
          )}
        >
          {saved ? <Check className="size-3.5" /> : null}
          {pending ? "saving…" : saved ? "saved" : "save"}
        </button>
      </div>
    </div>
  );
}

export function IntegrationsEditor({
  icsUrl,
  slackWebhook,
  obsidianPath,
  googleClientId,
  googleClientSecret,
  googleConnected,
  slackBotToken,
  slackReportChannels,
  slackInboxChannels,
  geminiApiKey,
}: {
  icsUrl: string;
  slackWebhook: string;
  obsidianPath: string;
  googleClientId: string;
  googleClientSecret: string;
  googleConnected: boolean;
  slackBotToken: string;
  slackReportChannels: string;
  slackInboxChannels: string;
  geminiApiKey: string;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-faint">
        integrations
      </p>
      <IntegrationField
        settingKey="gemini_api_key"
        label="Gemini API key (metered)"
        hint="A Google AI Studio key (aistudio.google.com/apikey) — NOT your Gemini app subscription, which has no API. Enables Gemini as a routable brain in AI Routing above. This one is billed per-token by Google (free tier available), unlike the Claude/Codex subscriptions."
        placeholder="AIza…"
        initial={geminiApiKey}
      />
      <IntegrationField
        settingKey="calendar_ics_url"
        label="Google Calendar (read-only ICS)"
        hint="Google Calendar → Settings → your calendar → 'Secret address in iCal format'. Paste that URL; the worker syncs events every 5 minutes."
        placeholder="https://calendar.google.com/calendar/ical/…/basic.ics"
        initial={icsUrl}
      />
      <IntegrationField
        settingKey="slack_webhook_url"
        label="Slack notifications"
        hint="An incoming-webhook URL (api.slack.com/apps → Incoming Webhooks). Every AIOS notification — agent reports, briefs — is also delivered there."
        placeholder="https://hooks.slack.com/services/…"
        initial={slackWebhook}
      />
      <IntegrationField
        settingKey="slack_bot_token"
        label="Slack bot token (read agent reports)"
        hint="A bot token (xoxb-…) with channels:history. Lets AIOS read the channels your Claude Desktop routines post to — that's how their output reaches the Agents page."
        placeholder="xoxb-…"
        initial={slackBotToken}
      />
      <IntegrationField
        settingKey="slack_report_channels"
        label="Slack channels to ingest"
        hint="Comma-separated channel IDs the bot has been invited to. Each new message becomes an external report."
        placeholder="C0A1B2C3D4E, C0F5G6H7I8J"
        initial={slackReportChannels}
        secret={false}
      />
      <IntegrationField
        settingKey="slack_inbox_channels"
        label="Slack capture channels → Inbox"
        hint="Comma-separated channel IDs (e.g. #ai-os) the bot has been invited to. Every new message is captured to the Inbox and auto-triaged into a task, note, idea, etc. — the bot then replies in-thread with how/where it filed (add chat:write + reactions:write scopes for that). Keep this separate from report channels."
        placeholder="C0ABCDEFG"
        initial={slackInboxChannels}
        secret={false}
      />
      <IntegrationField
        settingKey="obsidian_vault_path"
        label="Obsidian vault (read-only index)"
        hint="Absolute path to your vault folder. AIOS indexes the .md files into semantic search so chat and agents answer from your notes — nothing is ever written back."
        placeholder="/Users/you/Documents/SecondBrain"
        initial={obsidianPath}
        secret={false}
      />
      <IntegrationField
        settingKey="google_client_id"
        label="Google OAuth client ID"
        hint="From console.cloud.google.com → Credentials → OAuth client (Web application, redirect URI http://localhost:3777/api/google/callback)."
        placeholder="…apps.googleusercontent.com"
        initial={googleClientId}
        secret={false}
      />
      <IntegrationField
        settingKey="google_client_secret"
        label="Google OAuth client secret"
        hint="From the same OAuth client. Stored locally in your Postgres only."
        placeholder="GOCSPX-…"
        initial={googleClientSecret}
      />
      <GoogleConnect
        hasCredentials={!!googleClientId && !!googleClientSecret}
        connected={googleConnected}
      />
    </div>
  );
}
