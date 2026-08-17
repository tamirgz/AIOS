"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { cn } from "@/core/ui/cn";
import {
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  INTEGRATIONS,
  type Integration,
} from "@/core/integrations/registry";
import {
  detectMlx,
  detectObsidianVaults,
  saveIntegration,
  useObsidianVault,
} from "../actions";
import { GoogleConnect } from "./GoogleConnect";

const detectBtn =
  "rounded-lg border border-plasma/30 bg-plasma/10 px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-plasma transition hover:bg-plasma/20 disabled:opacity-40";

/** One-click local detection for the Obsidian / MLX cards. */
function DetectPanel({ kind }: { kind: "obsidian" | "mlx" }) {
  const [pending, start] = useTransition();
  const [vaults, setVaults] = useState<{ path: string; name: string }[] | null>(
    null,
  );
  const [msg, setMsg] = useState<string | null>(null);

  if (kind === "mlx") {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending}
          className={detectBtn}
          onClick={() =>
            start(async () => {
              setMsg(null);
              const r = await detectMlx();
              setMsg(
                r.ok
                  ? `✓ detected — saved ${r.models} model${r.models === 1 ? "" : "s"}`
                  : "LM Studio isn't running on :1234",
              );
            })
          }
        >
          {pending ? "detecting…" : "Detect from LM Studio"}
        </button>
        {msg && <span className="text-xs text-ink-dim">{msg}</span>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending}
          className={detectBtn}
          onClick={() =>
            start(async () => {
              setMsg(null);
              const v = await detectObsidianVaults();
              setVaults(v);
              if (!v.length) setMsg("no Obsidian vaults found — paste the path below");
            })
          }
        >
          {pending ? "detecting…" : "Detect vaults"}
        </button>
        {msg && <span className="text-xs text-ink-dim">{msg}</span>}
      </div>
      {vaults && vaults.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {vaults.map((v) => (
            <button
              key={v.path}
              type="button"
              disabled={pending}
              title={v.path}
              className="rounded-lg border border-ion/30 bg-ion/8 px-2.5 py-1 font-mono text-[10px] text-ion transition hover:bg-ion/15 disabled:opacity-40"
              onClick={() =>
                start(async () => {
                  await useObsidianVault(v.path);
                  setVaults(null);
                  setMsg(`✓ using "${v.name}"`);
                })
              }
            >
              use {v.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

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

type Status = { label: string; tone: "on" | "warn" | "off" };

function statusOf(
  i: Integration,
  values: Record<string, string>,
  googleConnected: boolean,
): Status {
  if (i.connect === "google") {
    if (googleConnected) return { label: "connected", tone: "on" };
    if (values.google_client_id && values.google_client_secret)
      return { label: "not connected", tone: "warn" };
    return { label: "not set", tone: "off" };
  }
  const configured = i.fields.some(
    (f) => f.kind !== "toggle" && (values[f.key] ?? "").trim() !== "",
  );
  return configured
    ? { label: "configured", tone: "on" }
    : { label: "not set", tone: "off" };
}

function StatusPill({ status }: { status: Status }) {
  const tone =
    status.tone === "on"
      ? "border-ion/30 bg-ion/10 text-ion"
      : status.tone === "warn"
        ? "border-solar/30 bg-solar/10 text-solar"
        : "border-white/10 text-ink-faint";
  return (
    <span
      className={cn(
        "shrink-0 rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest",
        tone,
      )}
    >
      {status.label}
    </span>
  );
}

/** One integration: header (label · blurb · status) then its fields. */
function IntegrationCard({
  integration,
  values,
  googleConnected,
}: {
  integration: Integration;
  values: Record<string, string>;
  googleConnected: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2 px-1">
        <div className="min-w-0">
          <p className="text-sm text-ink">{integration.label}</p>
          <p className="text-xs leading-snug text-ink-dim">{integration.blurb}</p>
        </div>
        <StatusPill status={statusOf(integration, values, googleConnected)} />
      </div>
      {integration.detect && <DetectPanel kind={integration.detect} />}
      {integration.fields.map((f) =>
        f.kind === "toggle" ? (
          <IntegrationToggle
            key={f.key}
            settingKey={f.key}
            label={f.label}
            hint={f.hint}
            // Toggles default ON unless explicitly stored "off".
            initialOn={(values[f.key] ?? "") !== "off"}
          />
        ) : (
          <IntegrationField
            // Keyed by value so a one-click detect (which saves + revalidates)
            // re-mounts the field with the freshly-detected value.
            key={`${f.key}:${values[f.key] ?? ""}`}
            settingKey={f.key}
            label={f.label}
            hint={f.hint}
            placeholder={f.placeholder ?? ""}
            initial={values[f.key] ?? ""}
            secret={f.kind === "secret"}
          />
        ),
      )}
      {integration.connect === "google" && (
        <GoogleConnect
          hasCredentials={!!values.google_client_id && !!values.google_client_secret}
          connected={googleConnected}
        />
      )}
    </div>
  );
}

export function IntegrationsEditor({
  values,
  googleConnected,
}: {
  values: Record<string, string>;
  googleConnected: boolean;
}) {
  return (
    <div className="flex flex-col gap-5">
      {CATEGORY_ORDER.map((cat) => {
        const items = INTEGRATIONS.filter((i) => i.category === cat);
        if (!items.length) return null;
        return (
          <div key={cat} className="flex flex-col gap-3">
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-faint">
              {CATEGORY_LABEL[cat]}
            </p>
            {items.map((i) => (
              <IntegrationCard
                key={i.id}
                integration={i}
                values={values}
                googleConnected={googleConnected}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}
