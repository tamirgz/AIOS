import { z } from "zod";
import type { AiToolDef } from "@/core/modules/types.server";
import { isentryConfigured } from "./db";
import { listPositions, listTransactions } from "./queries";

const NOT_CONNECTED = {
  error:
    "iSentry is not connected. Set ISENTRY_DATABASE_URL (a read-only Supabase " +
    "connection string) in .env.local to enable portfolio tools.",
};

/**
 * READ-ONLY portfolio tools over iSentry. Once registered, ⌘K chat and any agent
 * can answer portfolio questions and build the summaries/dashboards you ask for
 * — no new chat surface needed. All are risk:"safe" (reads); nothing here can
 * place a trade or mutate iSentry (the connection is a read-only role anyway).
 */
export const investmentTools: AiToolDef[] = [
  {
    name: "portfolio.positions",
    description:
      "List current portfolio holdings from iSentry (symbol, quantity, cost, value…). Read-only.",
    input: z.object({
      limit: z.number().int().min(1).max(500).default(200),
    }),
    risk: "safe",
    async execute(input) {
      if (!isentryConfigured()) return NOT_CONNECTED;
      try {
        const rows = await listPositions(input.limit);
        return { count: rows.length, positions: rows };
      } catch (e) {
        return { error: String(e).slice(0, 200) };
      }
    },
  },
  {
    name: "portfolio.transactions",
    description:
      "List recent portfolio transactions (buys/sells/dividends) from iSentry, newest first. Read-only.",
    input: z.object({
      limit: z.number().int().min(1).max(500).default(100),
    }),
    risk: "safe",
    async execute(input) {
      if (!isentryConfigured()) return NOT_CONNECTED;
      try {
        const rows = await listTransactions(input.limit);
        return { count: rows.length, transactions: rows };
      } catch (e) {
        return { error: String(e).slice(0, 200) };
      }
    },
  },
];
