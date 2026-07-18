import { serverModules } from "@/modules/registry.server";
import { modules } from "@/modules/registry";
import { GlassPanel } from "@/core/ui/GlassPanel";
import { cn } from "@/core/ui/cn";

const SIZE_CLASS = {
  sm: "col-span-12 md:col-span-4",
  md: "col-span-12 md:col-span-6",
  lg: "col-span-12",
} as const;

export default function DashboardPage() {
  const widgets = serverModules.flatMap((m) =>
    m.widgets.map((w) => ({ ...w, moduleId: m.id })),
  );

  return (
    <div className="grid grid-cols-12 gap-4">
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

      {widgets.map((w) => {
        const mod = modules.find((m) => m.id === w.moduleId);
        const Widget = w.component;
        return (
          <GlassPanel
            key={`${w.moduleId}:${w.id}`}
            className={cn("flex flex-col p-5", SIZE_CLASS[w.size])}
          >
            <p
              className="mb-3 font-mono text-[10px] uppercase tracking-[0.25em]"
              style={{ color: mod?.accent ?? "var(--color-ink-faint)" }}
            >
              {w.title}
            </p>
            <div className="min-h-0 flex-1">
              <Widget />
            </div>
          </GlassPanel>
        );
      })}
    </div>
  );
}
