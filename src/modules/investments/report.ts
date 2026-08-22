"use server";

import { createTask } from "@/modules/workbench/actions";

/**
 * Model the report runs on. The full 6-section report is a demanding multi-step
 * agentic task: qwen3-coder:30b grounds on simple asks but stops short on this;
 * the MLX abliterated (light reasoning) carries the loop and grounds. It needs
 * LM Studio warm. The model is a PER-ATTEMPT choice in the Workbench — retry the
 * task on Claude (claude-headless) for a guaranteed-thorough version, or compare
 * models side by side (best-of-N is built in).
 */
const REPORT_MODEL = "mlx/huihui-qwen3.6-35b-a3b-claude-4.7-opus-abliterated-mlx";

const DEEP_REPORT_PROMPT = [
  "Produce a THOROUGH, well-structured investment report on the user's portfolio. Read-only. DESCRIPTIVE only — NOT financial advice, no buy/sell/hold recommendations.",
  "GROUND EVERYTHING in tool results — every number, ticker and chart data point MUST come from a tool you call in THIS run. Never invent figures or placeholder labels.",
  "",
  "Gather first (call each once): portfolio.summary; portfolio.allocation (top 8) for the allocation chart; portfolio.positions; portfolio.performance (days 180); portfolio.byStrategy for each strategy tag in the notes — at least 'Algo' and 'Leopold'; portfolio.savings; market.quote for the benchmarks ^GSPC and ^IXIC.",
  "",
  "Then write the report with these markdown sections, each grounded in the real numbers:",
  "## Executive summary — 3-4 sentences: total value, net P&L, the one-line story.",
  "## Portfolio overview — value, cost basis, unrealized/realized P&L, dividends. Include a DONUT chart: pass portfolio.allocation's `slices` straight to viz.chart (type donut, unit currency).",
  "## Performance & trend — the value trend from portfolio.performance as a viz.chart AREA/LINE; note the change over the period and how it compares to the ^GSPC / ^IXIC benchmarks.",
  "## Strategy breakdown — for each tagged strategy: invested, total return %, realized and unrealized P&L. Include a viz.chart HBAR of P&L by symbol for the main strategy (unit currency).",
  "## Positions of note — biggest winners and losers, concentration risk, and any symbols flagged with caveats.",
  "## Observations & watch-items — 4-6 grounded observations and what's worth monitoring. Still no recommendations.",
  "",
  "For every chart, call viz.chart with the REAL data and put its returned `embed` markdown in that section.",
  "Finally, save the complete report as a note via notes.create (title: 'Investment report — <today's date>') so it is kept, then end with a 2-line summary of what you produced.",
].join("\n");

/**
 * Spawn a deep investment report as a Workbench task on the native executor
 * (apOS's own tools — portfolio/market/viz) using the faithful MLX abliterated
 * model. Returns the task id so the caller can open it in the Workbench.
 */
export async function createInvestmentReport(): Promise<{ id: string }> {
  const task = await createTask({
    prompt: DEEP_REPORT_PROMPT,
    taskType: "docs",
    executorId: "native",
    model: REPORT_MODEL,
    createdFrom: "investments",
  });
  return { id: task.id };
}
