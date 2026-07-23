import { cn } from "@/core/ui/cn";
import { HEALTH_META } from "../health";
import type { ProjectHealth } from "../schema";

/** The L2 health micro-chip: colored dot + label, with the reason on hover. */
export function HealthChip({
  health,
  reason,
  className,
}: {
  health: ProjectHealth;
  reason?: string;
  className?: string;
}) {
  const meta = HEALTH_META[health];
  return (
    <span
      title={reason}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest",
        meta.chip,
        className,
      )}
    >
      <span className="size-1.5 rounded-full" style={{ background: meta.accent }} />
      {meta.label}
    </span>
  );
}
