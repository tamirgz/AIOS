import { preloadMlx } from "./preload";

// Throttle focus-driven preloads: refocusing an input fires onFocus repeatedly,
// but one kick per ~30s is plenty to cover a cold start (and to re-warm if the
// idle-unload already stopped the server since the last keystroke).
let last = 0;

/** Fire-and-forget MLX warm-up from a client input's onFocus. */
export function warmMlx(): void {
  const now = Date.now();
  if (now - last < 30_000) return;
  last = now;
  void preloadMlx();
}
