import { serverModules } from "@/modules/registry.server";
import { modules } from "@/modules/registry";
import { GlassPanel } from "@/core/ui/GlassPanel";
import { WidgetFrame } from "@/core/ui/WidgetFrame";

// Widgets render live DB data — never prerender this page at build time.
export const dynamic = "force-dynamic";

export default function DashboardPage() {
  const widgets = serverModules.flatMap((m) =>
    m.widgets.map((w) => ({ ...w, moduleId: m.id })),
  );

  return (
    // Uniform deck: equal columns, equal row heights. On large screens the grid
    // stretches to fill the viewport (auto-rows-fr + min-height), so the cards
    // use the whole dashboard instead of leaving dead space; small screens keep
    // a fixed row height and scroll naturally. Cards fill their cell and scroll
    // internally, so the layout stays clean regardless of content.
    <div className="grid auto-rows-[13rem] grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 lg:auto-rows-fr lg:[min-height:calc(100dvh-6rem)] xl:grid-cols-4">
      {widgets.length === 0 && (
        <GlassPanel className="col-span-full flex flex-col items-center gap-3 px-8 py-20 text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.35em] text-plasma text-glow">
            systems online
          </p>
          <h2 className="font-display text-3xl font-semibold text-ink">
            Awaiting first module
          </h2>
          <p className="max-w-md text-sm text-ink-dim">
            The shell is live. Modules registered in{" "}
            <code className="font-mono text-xs text-ion">src/modules/registry.ts</code>{" "}
            will appear in the sidebar and populate this deck with widgets.
          </p>
        </GlassPanel>
      )}

      {widgets.map((w, i) => {
        const mod = modules.find((m) => m.id === w.moduleId);
        const Widget = w.component;
        return (
          <WidgetFrame
            key={`${w.moduleId}:${w.id}`}
            index={i}
            accent={mod?.accent ?? "var(--color-ink-faint)"}
            title={w.title}
            // Every card's header opens its module's page.
            href={`/m/${w.moduleId}`}
          >
            <Widget />
          </WidgetFrame>
        );
      })}
    </div>
  );
}
