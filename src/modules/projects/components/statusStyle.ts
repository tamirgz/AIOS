import type { ProjectStatus } from "../schema";

/** Chip styling per project status — mono uppercase micro-chips. */
export const STATUS_CHIP: Record<ProjectStatus, string> = {
  active: "border-plasma/30 bg-plasma/10 text-plasma",
  paused: "border-solar/30 bg-solar/10 text-solar",
  done: "border-white/8 bg-white/4 text-ink-faint",
};
