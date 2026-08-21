import type { AgentTemplate } from "@/core/modules/types.server";

/**
 * Investment insight agent — the "learns your activity and produces insight"
 * capability. Read→synthesize→remember, the same agentic shape as memory
 * consolidation, so it runs on the same FREE LOCAL model (never bills).
 *
 * SCOPE: descriptive and observational ONLY — concentration, drift, notable
 * moves, things to look at. It must NOT give buy/sell recommendations or
 * personalized investment advice; it reports what the numbers show.
 *
 * Manual-only (defaultSchedule: null) during validation — trigger it yourself,
 * judge the quality, and flip it to a weekly cron once it proves out.
 */
export const investmentInsightTemplate: AgentTemplate = {
  id: "investment-insight",
  name: "Investment insight",
  description:
    "Reviews your iSentry portfolio (positions + recent transactions) and writes a concise, honest, DESCRIPTIVE read — concentration, drift, notable moves — into memory so insight accrues over time. Free local model. Not financial advice.",
  defaultPrompt: [
    "Produce a SHORT, honest, DESCRIPTIVE read on the user's investment activity. Read-only — never place trades, change data, or recommend buying/selling.",
    "1. portfolio.positions — current holdings. 2. portfolio.transactions — recent activity.",
    "Then write 3-6 grounded observations: concentration/exposure, notable recent moves, drift from the apparent intent, anything worth a closer look. Cite the actual numbers. NO generic tips, NO buy/sell/hold recommendations, NO personalized advice — describe what the data shows and let the user decide.",
    "Save the read with memory.remember (kind: fact or lesson) so insight accrues across runs. Do not repeat an observation you already saved.",
  ].join("\n"),
  defaultTools: ["portfolio.positions", "portfolio.transactions"],
  defaultSchedule: null, // manual-only during validation; flip to weekly once proven
  // Same read→synthesize→write shape as consolidation → same proven model.
  defaultProvider: "mlx",
  defaultModel: "huihui-qwen3.6-35b-a3b-claude-4.7-opus-abliterated-mlx",
  defaultFallbackModel: "qwen3-coder:30b",
  defaultTurnBudget: 12,
};
