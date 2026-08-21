import { z } from "zod";
import type { AiToolDef } from "@/core/modules/types.server";
import { isentryConfigured } from "./db";
import {
  listPositions,
  listTransactions,
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
];
