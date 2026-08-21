import { isentrySql, isentryAccountId } from "./db";

/**
 * THE PORTABLE DOMAIN LAYER — the only file that knows iSentry's schema.
 *
 * Keep ALL iSentry SQL here. If you later productize this capability as a feature
 * inside iSentry, this layer lifts across unchanged (same Supabase DB, even
 * closer) — you'd only swap apOS's brain (providers/memory/chat) for iSentry's
 * own. That portability is the whole reason the queries live in one file.
 *
 * ⚠️ SCHEMA MAP — PLACEHOLDERS. Fill `table` / column names to match iSentry's
 * real Supabase schema (paste `\d+` or the table DDL and I'll finalize these).
 * Until then the tools return a clear "schema not mapped" error rather than
 * guessing wrong tables.
 */
const SCHEMA = {
  positions: {
    table: "positions", // holdings: symbol, quantity, avg_cost, market_value…
    account: "account_id",
  },
  transactions: {
    table: "transactions", // buys/sells/dividends: symbol, side, quantity, price…
    account: "account_id",
    orderBy: "executed_at", // newest first
  },
} as const;

/** Optional owner-scoping clause for single-user validation. */
function withAccount(col: string) {
  const id = isentryAccountId();
  return id ? { col, id } : null;
}

export async function listPositions(limit = 200) {
  const sql = isentrySql();
  const acct = withAccount(SCHEMA.positions.account);
  const rows = acct
    ? await sql`select * from ${sql(SCHEMA.positions.table)}
                where ${sql(acct.col)} = ${acct.id} limit ${limit}`
    : await sql`select * from ${sql(SCHEMA.positions.table)} limit ${limit}`;
  return rows;
}

export async function listTransactions(limit = 100) {
  const sql = isentrySql();
  const acct = withAccount(SCHEMA.transactions.account);
  const rows = acct
    ? await sql`select * from ${sql(SCHEMA.transactions.table)}
                where ${sql(acct.col)} = ${acct.id}
                order by ${sql(SCHEMA.transactions.orderBy)} desc limit ${limit}`
    : await sql`select * from ${sql(SCHEMA.transactions.table)}
                order by ${sql(SCHEMA.transactions.orderBy)} desc limit ${limit}`;
  return rows;
}

// TODO (after schema is mapped): performanceSummary(), allocationByAssetClass(),
// realizedPnL(period) — these need the concrete cost/price/quantity columns, so
// they're deliberately left out of the skeleton rather than guessed.
