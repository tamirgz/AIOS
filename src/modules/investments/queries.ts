import { isentrySql, isentryAccountId } from "./db";

/**
 * THE PORTABLE DOMAIN LAYER — the only file that knows iSentry's schema.
 *
 * Mapped from iSentry's live Supabase schema:
 *   - portfolio_holdings_computed — CURRENT positions (the *_bak_20260805 table
 *     is the pre-migration backup; do not read it).
 *   - portfolio_transactions      — raw buys/sells/dividends.
 *   - portfolio_snapshots         — daily portfolio value time series (USD+ILS).
 *   - portfolios                  — owns user_id; holdings/tx/snapshots are
 *                                   portfolio_id-scoped, so we JOIN to filter by user.
 * Money columns come in native `currency` plus derived `_usd` (converted via the
 * exchange_rates table); snapshots also carry ILS. Quantities are fractional.
 *
 * NOTE: the iSentry team's own data-access doc may prefer a VIEW/RPC over the
 * computed table (for freshness guarantees) — swap the FROM here if so; nothing
 * else changes. Everything is READ-ONLY.
 */

/** Owner scope: holdings/tx/snapshots join `portfolios`, filtered on user_id.
 *  Empty when no account id is set (single-user, read-all — safe only solo). */
function userScope(sql: ReturnType<typeof isentrySql>) {
  const id = isentryAccountId();
  return id ? sql`and p.user_id = ${id}` : sql``;
}

export async function listPositions(limit = 200) {
  const sql = isentrySql();
  return sql`
    select p.name as portfolio, h.symbol, h.name, h.exchange, h.currency,
           h.current_quantity, h.average_cost, h.average_cost_usd,
           h.current_price_usd, h.market_value_usd, h.cost_basis_usd,
           (h.market_value_usd - h.cost_basis_usd) as unrealized_pnl_usd,
           h.realized_pnl_usd, h.total_dividends_usd, h.last_transaction_date
    from portfolio_holdings_computed h
    join portfolios p on p.id = h.portfolio_id
    where h.current_quantity <> 0 ${userScope(sql)}
    order by h.market_value_usd desc nulls last
    limit ${limit}`;
}

export async function listTransactions(limit = 100) {
  const sql = isentrySql();
  return sql`
    select p.name as portfolio, t.symbol, t.name, t.transaction_type,
           t.quantity, t.price, t.total_amount, t.currency, t.exchange_rate,
           t.transaction_date, t.notes
    from portfolio_transactions t
    join portfolios p on p.id = t.portfolio_id
    where true ${userScope(sql)}
    order by t.transaction_date desc
    limit ${limit}`;
}

/** Portfolio value time series (summed across the user's portfolios per day). */
export async function performanceSnapshots(days = 180) {
  const sql = isentrySql();
  return sql`
    select s.date,
           sum(s.total_value_usd) as total_value_usd,
           sum(s.total_value_ils) as total_value_ils,
           sum(s.total_pnl_usd)   as total_pnl_usd
    from portfolio_snapshots s
    join portfolios p on p.id = s.portfolio_id
    where s.date >= (current_date - ${days}::int) ${userScope(sql)}
    group by s.date
    order by s.date`;
}

/** One-row roll-up across all live holdings (values in USD). */
export async function portfolioSummary() {
  const sql = isentrySql();
  const [row] = await sql`
    select count(*)::int                                    as positions,
           sum(h.market_value_usd)                          as market_value_usd,
           sum(h.cost_basis_usd)                            as cost_basis_usd,
           sum(h.market_value_usd - h.cost_basis_usd)       as unrealized_pnl_usd,
           sum(h.realized_pnl_usd)                          as realized_pnl_usd,
           sum(h.total_dividends_usd)                       as dividends_usd
    from portfolio_holdings_computed h
    join portfolios p on p.id = h.portfolio_id
    where h.current_quantity <> 0 ${userScope(sql)}`;
  return row ?? null;
}
