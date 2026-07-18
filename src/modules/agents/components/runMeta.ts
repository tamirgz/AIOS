import type { RunStatus } from "@/core/db/schema/agents";

export const RUN_STATUS_META: Record<
  RunStatus,
  { label: string; color: string; pulse: boolean }
> = {
  queued: { label: "queued", color: "var(--color-ion)", pulse: true },
  running: { label: "running", color: "var(--color-solar)", pulse: true },
  succeeded: { label: "ok", color: "var(--color-plasma)", pulse: false },
  failed: { label: "failed", color: "var(--color-flare)", pulse: false },
  timed_out: { label: "timed out", color: "var(--color-solar)", pulse: false },
};

export function runDuration(start: Date | null, end: Date | null): string {
  if (!start) return "—";
  const ms = (end ?? new Date()).getTime() - start.getTime();
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.round((ms % 60_000) / 1000)}s`;
}
