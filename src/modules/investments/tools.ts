import { z } from "zod";
import type { AiToolDef } from "@/core/modules/types.server";
import { isentryConfigured } from "./db";
import {
  listPositions,
  listTransactions,
  listSavings,
  performanceByStrategy,
  performanceSnapshots,
  portfolioSummary,
} from "./queries";

const NOT_CONNECTED = {
  error:
    "iSentry is not connected. Set ISENTRY_DATABASE_URL (a read-only Supabase " +
    "connection string) in .env.local to enable portfolio tools.",
};

/** Wrap a read so an unconfigured/erroring source returns a message, not a throw. */
function guarded<T>(fn: () => Promise<T>) {
  return async () => {
    if (!isentryConfigured()) return NOT_CONNECTED;
    try {
      return await fn();
    } catch (e) {
      return { error: String(e).slice(0, 200) };
    }
  };
}

/**
 * READ-ONLY portfolio tools over iSentry. Once registered, ⌘K chat and any agent
 * can answer portfolio questions and build the summaries/dashboards you ask for.
 * All risk:"safe" (reads); the connection is a read-only role, so nothing here
 * can place a trade or mutate iSentry. Values are USD unless a native `currency`
 * column says otherwise.
 */
export const investmentTools: AiToolDef[] = [
  {
    name: "portfolio.positions",
    description:
      "Current holdings from iSentry: symbol, quantity, avg cost, current price, market value, unrealized/realized P&L, dividends, currency. Read-only. Highest value first.",
    input: z.object({ limit: z.number().int().min(1).max(500).default(200) }),
    risk: "safe",
    execute: (input: { limit: number }) =>
      guarded(async () => {
        const rows = await listPositions(input.limit);
        return { count: rows.length, positions: rows };
      })(),
  },
  {
    name: "portfolio.transactions",
    description:
      "Recent portfolio transactions (buys/sells/dividends) from iSentry, newest first: symbol, type, quantity, price, total, currency, date. Read-only.",
    input: z.object({ limit: z.number().int().min(1).max(500).default(100) }),
    risk: "safe",
    execute: (input: { limit: number }) =>
      guarded(async () => {
        const rows = await listTransactions(input.limit);
        return { count: rows.length, transactions: rows };
      })(),
  },
  {
    name: "portfolio.performance",
    description:
      "Daily portfolio value time series (total value in USD + ILS, and P&L) for the last N days, summed across your portfolios. Use for trend/performance questions and charts. Read-only.",
    input: z.object({ days: z.number().int().min(7).max(1825).default(180) }),
    risk: "safe",
    execute: (input: { days: number }) =>
      guarded(async () => {
        const rows = await performanceSnapshots(input.days);
        return { days: input.days, points: rows.length, series: rows };
      })(),
  },
  {
    name: "portfolio.summary",
    description:
      "One-line roll-up across all live holdings (USD): number of positions, total market value, cost basis, unrealized & realized P&L, dividends. Read-only.",
    input: z.object({}),
    risk: "safe",
    execute: () => guarded(async () => ({ summary: await portfolioSummary() }))(),
  },
  {
    name: "portfolio.byStrategy",
    description:
      "Measure the performance of trades tagged with a strategy label in their transaction notes (e.g. 'Algo', 'Leopold'). Attributes ONLY the tagged buys/sells (not a symbol's whole P&L), split-adjusted. Returns per-symbol invested/realized/open-value/unrealized in USD plus totals and a return %. Symbols flagged with a `caveat` had a tagged sell with no tagged buy (or oversold), so their cost basis is incomplete. Read-only.",
    input: z.object({
      tag: z
        .string()
        .min(1)
        .describe("Strategy tag exactly as written in transaction notes, e.g. 'Algo'"),
    }),
    risk: "safe",
    execute: (input: { tag: string }) =>
      guarded(async () => {
        const rows = (await performanceByStrategy(input.tag)) as Record<string, unknown>[];
        const per = rows.map((r) => {
          const buyQty = Number(r.buy_qty) || 0;
          const buyCost = Number(r.buy_cost_usd) || 0;
          const sellQty = Number(r.sell_qty) || 0;
          const proceeds = Number(r.sell_proceeds_usd) || 0;
          const price = r.current_price_usd == null ? null : Number(r.current_price_usd);
          const avgCost = buyQty > 0 ? buyCost / buyQty : null;
          const netQty = buyQty - sellQty;
          // realized on tagged sells (needs a tagged buy for cost basis)
          const realized =
            sellQty > 0 && avgCost != null ? proceeds - sellQty * avgCost : 0;
          const openValue = netQty > 0 && price != null ? netQty * price : 0;
          const unrealized =
            netQty > 0 && avgCost != null && price != null
              ? openValue - netQty * avgCost
              : 0;
          const caveat =
            sellQty > 0 && buyQty === 0
              ? "tagged sell with no tagged buy — cost basis unknown"
              : netQty < 0
                ? "tagged sells exceed tagged buys — some buys untagged"
                : undefined;
          return {
            symbol: r.symbol,
            invested_usd: +buyCost.toFixed(2),
            open_qty: +netQty.toFixed(4),
            open_value_usd: +openValue.toFixed(2),
            realized_pnl_usd: +realized.toFixed(2),
            unrealized_pnl_usd: +unrealized.toFixed(2),
            ...(caveat ? { caveat } : {}),
          };
        });
        const sum = (k: keyof (typeof per)[number]) =>
          per.reduce((a, r) => a + (Number(r[k]) || 0), 0);
        const invested = sum("invested_usd");
        const realized = sum("realized_pnl_usd");
        const unrealized = sum("unrealized_pnl_usd");
        const openValue = sum("open_value_usd");
        const totalPnl = realized + unrealized;
        return {
          tag: input.tag,
          symbols: per.length,
          totals: {
            invested_usd: +invested.toFixed(2),
            open_value_usd: +openValue.toFixed(2),
            realized_pnl_usd: +realized.toFixed(2),
            unrealized_pnl_usd: +unrealized.toFixed(2),
            total_pnl_usd: +totalPnl.toFixed(2),
            return_pct: invested > 0 ? +((100 * totalPnl) / invested).toFixed(2) : null,
          },
          caveats: per.filter((r) => "caveat" in r).map((r) => r.symbol),
          bySymbol: per.sort((a, b) => b.open_value_usd - a.open_value_usd),
        };
      })(),
  },
  {
    name: "portfolio.savings",
    description:
      "Cash and savings accounts (and any loans against them): name, amount, currency, loan amount, monthly payment. Read-only. Complements holdings for a net-worth view.",
    input: z.object({}),
    risk: "safe",
    execute: () =>
      guarded(async () => {
        const rows = await listSavings();
        return { count: rows.length, accounts: rows };
      })(),
  },
];
