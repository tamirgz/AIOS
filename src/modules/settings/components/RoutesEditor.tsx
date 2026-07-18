"use client";

import { useEffect, useState, useTransition } from "react";
import { Check } from "lucide-react";
import { cn } from "@/core/ui/cn";
import type { AiRoute, AIProviderId } from "@/core/db/schema/ai-routes";
import { AI_PROVIDERS } from "@/core/db/schema/ai-routes";
import { saveRoute } from "../actions";

const KEY_LABELS: Record<string, string> = {
  chat: "⌘K chat & commands",
  "agent.default": "Agents (default)",
};

function RouteRow({ route }: { route: AiRoute }) {
  const [provider, setProvider] = useState<AIProviderId>(route.provider);
  const [model, setModel] = useState(route.model);
  const [models, setModels] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [savedTick, setSavedTick] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setModels([]);
    setLoadError(null);
    fetch(`/api/ai/models?provider=${provider}`)
      .then((r) => r.json())
      .then((d: { models: string[]; error?: string }) => {
        if (cancelled) return;
        setModels(d.models);
        if (d.error) setLoadError(d.error);
      })
      .catch((e) => !cancelled && setLoadError(String(e)));
    return () => {
      cancelled = true;
    };
  }, [provider]);

  const dirty = provider !== route.provider || model !== route.model;

  return (
    <div className="glass flex flex-wrap items-center gap-3 rounded-xl p-4">
      <div className="min-w-44">
        <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-ink-faint">
          {route.taskKey}
        </p>
        <p className="text-sm text-ink">
          {KEY_LABELS[route.taskKey] ?? route.taskKey}
        </p>
      </div>

      <select
        value={provider}
        onChange={(e) => {
          const p = e.target.value as AIProviderId;
          setProvider(p);
          setModel("");
        }}
        className="h-9 rounded-lg border border-white/10 bg-abyss px-3 font-mono text-xs text-ink outline-none focus:border-plasma/40"
      >
        {AI_PROVIDERS.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>

      <select
        value={model}
        onChange={(e) => setModel(e.target.value)}
        className="h-9 min-w-56 flex-1 rounded-lg border border-white/10 bg-abyss px-3 font-mono text-xs text-ink outline-none focus:border-plasma/40"
      >
        {model && !models.includes(model) && (
          <option value={model}>{model}</option>
        )}
        <option value="" disabled>
          {models.length ? "select model…" : "loading models…"}
        </option>
        {models.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>

      <button
        type="button"
        disabled={!dirty || !model || pending}
        onClick={() =>
          startTransition(async () => {
            await saveRoute(route.taskKey, provider, model);
            setSavedTick(true);
            setTimeout(() => setSavedTick(false), 1600);
          })
        }
        className={cn(
          "flex h-9 items-center gap-1.5 rounded-lg px-4 font-mono text-[11px] uppercase tracking-widest transition",
          dirty
            ? "bg-plasma/15 text-plasma hover:bg-plasma/25"
            : "border border-white/8 text-ink-faint",
          pending && "opacity-50",
        )}
      >
        {savedTick ? <Check className="size-3.5" /> : null}
        {pending ? "saving…" : savedTick ? "saved" : "save"}
      </button>

      {loadError && (
        <p className="w-full font-mono text-[10px] text-flare">
          model list unavailable: {loadError.slice(0, 120)}
        </p>
      )}
    </div>
  );
}

export function RoutesEditor({ routes }: { routes: AiRoute[] }) {
  return (
    <div className="flex flex-col gap-3">
      <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-faint">
        ai routing — which brain answers which job
      </p>
      {routes.map((r) => (
        <RouteRow key={r.taskKey} route={r} />
      ))}
    </div>
  );
}
