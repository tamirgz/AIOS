"use server";

import { resolveRoute } from "./routing";
import { startMlx } from "./mlx-runtime";

/**
 * Warm the MLX server the moment the user starts typing in Ask / ⌘K, so the
 * model is loading before they submit. No-op unless the ask (or chat) route
 * actually points at the `mlx` provider — nothing starts a 17GB load for users
 * who route those tasks to Ollama or Claude. Best-effort and fire-and-forget:
 * the real request still awaits ensureMlxUp(), so a missed preload only costs
 * latency, never correctness.
 */
export async function preloadMlx(): Promise<void> {
  try {
    const [ask, chat] = await Promise.all([
      resolveRoute("ask"),
      resolveRoute("chat"),
    ]);
    if (ask.providerId === "mlx" || chat.providerId === "mlx") {
      await startMlx();
    }
  } catch {
    // Preload is an optimization only — never surface its failures.
  }
}
