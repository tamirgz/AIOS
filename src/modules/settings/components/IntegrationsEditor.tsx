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

/** An on/off setting stored as "on"/"off" via saveIntegration. */
function IntegrationToggle({
  settingKey,
  label,
  hint,
  initialOn,
}: {
  settingKey: string;
  label: string;
  hint: string;
  initialOn: boolean;
}) {
  const [on, setOn] = useState(initialOn);
  const [pending, startTransition] = useTransition();

  return (
    <div className="glass flex items-start justify-between gap-3 rounded-xl p-3">
      <div className="min-w-0">
        <p className="text-sm text-ink">
          {label}{" "}
          <span className="font-mono text-[9px] uppercase tracking-widest text-ink-faint">
            {settingKey}
          </span>
        </p>
        <p className="mt-0.5 text-xs leading-snug text-ink-dim">{hint}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        disabled={pending}
        onClick={() => {
          const next = !on;
          setOn(next);
          startTransition(async () => {
            await saveIntegration(settingKey, next ? "on" : "off");
          });
        }}
        className={cn(
          "relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition",
          on ? "bg-plasma/60" : "bg-white/10",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-5 rounded-full bg-white transition-all",
            on ? "left-[22px]" : "left-0.5",
          )}
        />
      </button>
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
  searxngUrl,
  webSearchOn,
  readerProxyUrl,
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
  searxngUrl: string;
  webSearchOn: boolean;
  readerProxyUrl: string;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-faint">
        integrations
      </p>
      <IntegrationToggle
        settingKey="ask_web_search"
        label="Ask · web-search enrichment"
        hint="When on, Ask supplements your own data with a few current, authoritative pages fetched via SearXNG below (standards bodies, official docs — never paywalls or Wikipedia). Your saved data stays the source of truth; the web only enriches. Off ⇒ Ask answers from your corpus alone."
        initialOn={webSearchOn}
      />
      <IntegrationField
        settingKey="searxng_url"
        label="SearXNG endpoint (for Ask web search)"
        hint="Base URL of a self-hosted SearXNG with the JSON format enabled — keyless and free (no paid search API). Leave blank to use the SEARXNG_URL env var. Example: https://your-host/searxng"
        placeholder="https://your-host/searxng"
        initial={searxngUrl}
        secret={false}
      />
      <IntegrationField
        settingKey="reader_proxy_url"
        label="Reader proxy (for Workbench research)"
        hint="Reads article URLs that block a direct fetch (403 bot-walls), returning clean text. Only the public URL is sent — keyless, no cost. Blank uses the default r.jina.ai; set 'off' to stay local-only; or point at a self-hosted reader. Example: https://r.jina.ai/"
        placeholder="https://r.jina.ai/"
        initial={readerProxyUrl}
        secret={false}
      />
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
        placeholder="C0B7TLBJ4LU, C0B7VNRPQSV"
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
