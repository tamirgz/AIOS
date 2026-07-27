import type { ComponentType } from "react";
import { serverModules } from "@/modules/registry.server";
import { modules } from "@/modules/registry";
import { GlassPanel } from "@/core/ui/GlassPanel";
import { WidgetFrame } from "@/core/ui/WidgetFrame";

// Widgets render live DB data — never prerender this page at build time.
export const dynamic = "force-dynamic";

type DeckWidget = {
  id: string;
  title: string;
  moduleId: string;
  component: ComponentType;
  stat?: ComponentType;
  priority: 1 | 2 | 3;
  span: number;
  accent: string;
};

// Column span → static class (Tailwind can't see interpolated class names).
const SPAN_CLASS: Record<number, string> = {
  2: "lg:col-span-2",
  3: "lg:col-span-3",
  4: "lg:col-span-4",
};

function TierLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-2.5 flex items-center gap-3 px-1">
      <span className="font-mono text-[9px] uppercase tracking-[0.28em] text-ink-faint">
        {children}
      </span>
      <span className="h-px flex-1 bg-gradient-to-r from-white/8 to-transparent" />
    </div>
  );
}

export default function DashboardPage() {
  const widgets: DeckWidget[] = serverModules.flatMap((m) => {
    const accent =
      modules.find((mod) => mod.id === m.id)?.accent ?? "var(--color-ink-faint)";
    return m.widgets.map((w) => ({
      id: w.id,
      title: w.title,
      moduleId: m.id,
      component: w.component,
      stat: w.stat,
      priority: w.priority ?? 2,
      span: w.span ?? 1,
      accent,
    }));
  });

  if (widgets.length === 0) {
    return (
      <GlassPanel className="flex flex-col items-center gap-3 px-8 py-20 text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.35em] text-plasma text-glow">
          systems online
        </p>
        <h2 className="font-display text-3xl font-semibold text-ink">
          Awaiting first module
        </h2>
        <p className="max-w-md text-sm text-ink-dim">
          Modules registered in{" "}
          <code className="font-mono text-xs text-ion">src/modules/registry.ts</code>{" "}
          will populate this deck with widgets.
        </p>
      </GlassPanel>
    );
  }

  const tier1 = widgets.filter((w) => w.priority === 1);
  const tier2 = widgets.filter((w) => w.priority === 2);
  const tier3 = widgets.filter((w) => w.priority === 3);

  let idx = 0;
  const frame = (w: DeckWidget, extra: string) => {
    const Widget = w.component;
    return (
      <WidgetFrame
        key={`${w.moduleId}:${w.id}`}
        index={idx++}
        accent={w.accent}
        title={w.title}
        href={`/m/${w.moduleId}`}
        className={extra}
      >
        <Widget />
      </WidgetFrame>
    );
  };

  return (
    <div className="flex flex-col gap-7">
      {/* TIER 1 — Now: what needs you, today's agenda, what to work on next. */}
      {tier1.length > 0 && (
        <section>
          <TierLabel>Now</TierLabel>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
            {tier1.map((w) =>
              frame(
                w,
                `${SPAN_CLASS[w.span] ?? ""} ${w.span >= 4 ? "min-h-[8.5rem]" : "min-h-[15rem]"}`,
              ),
            )}
          </div>
        </section>
      )}

      {/* TIER 2 — In motion: active work & automation, glanceable. */}
      {tier2.length > 0 && (
        <section>
          <TierLabel>In motion</TierLabel>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {tier2.map((w) => frame(w, "min-h-[12.5rem]"))}
          </div>
        </section>
      )}

      {/* TIER 3 — Ambient: passive counts, one slim pulse strip. */}
      {tier3.length > 0 && (
        <section>
          <TierLabel>At a glance</TierLabel>
          <div className="glass grid grid-cols-2 divide-x divide-y divide-white/5 overflow-hidden rounded-(--radius-panel) sm:grid-cols-4 sm:divide-y-0">
            {tier3.map((w) => {
              const Stat = w.stat ?? w.component;
              return <Stat key={`${w.moduleId}:${w.id}`} />;
            })}
          </div>
        </section>
      )}
    </div>
  );
}
