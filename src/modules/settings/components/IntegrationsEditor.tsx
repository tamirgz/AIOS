"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { cn } from "@/core/ui/cn";
import { saveIntegration } from "../actions";

function IntegrationField({
  settingKey,
  label,
  hint,
  placeholder,
  initial,
}: {
  settingKey: string;
  label: string;
  hint: string;
  placeholder: string;
  initial: string;
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
          type="password"
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
}: {
  icsUrl: string;
  slackWebhook: string;
}) {
  return (
    <div className="flex flex-col gap-2.5">
      <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-faint">
        integrations
      </p>
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
    </div>
  );
}
