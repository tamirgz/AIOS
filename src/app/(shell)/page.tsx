import { serverModules } from "@/modules/registry.server";
import { modules } from "@/modules/registry";
import { GlassPanel } from "@/core/ui/GlassPanel";
import { WidgetFrame } from "@/core/ui/WidgetFrame";
import { cn } from "@/core/ui/cn";

// Widgets render live DB data — never prerender this page at build time.
export const dynamic = "force-dynamic";

const SIZE_CLASS = {
  sm: "col-span-12 md:col-span-4",
  md: "col-span-12 md:col-span-6 xl:col-span-4",
  lg: "col-span-12",
} as const;

export default function DashboardPage() {
  const widgets = serverModules.flatMap((m) =>
    m.widgets.map((w) => ({ ...w, moduleId: m.id })),
  );

  return (
    <div className="grid grid-cols-12 gap-3">
      {widgets.length === 0 && (
        <GlassPanel className="col-span-12 flex flex-col items-center gap-3 px-8 py-20 text-center">
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
            className={cn(SIZE_CLASS[w.size])}
          >
            <Widget />
          </WidgetFrame>
        );
      })}
    </div>
  );
}
