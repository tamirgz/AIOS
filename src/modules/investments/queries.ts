import { isentrySql, isentryAccountId } from "./db";

/**
 * THE PORTABLE DOMAIN LAYER — the only file that knows iSentry's schema.
 * Mapped from iSentry's official data-access doc. Everything is READ-ONLY.
 *
 * Sources of truth we read:
 *   - portfolio_holdings_computed — CURRENT positions/P&L (trigger-maintained,
 *     effectively live; the *_bak_20260805 table is a stale backup — never read).
 *   - portfolio_transactions (+ _adjusted for split/FX-adjusted USD) — trades.
 *   - portfolio_snapshots — daily EOD value series (USD + ILS).
 *   - savings_accounts — cash/savings (user-scoped).
 *
 * Golden rules from the doc:
 *   - Read the pre-computed *_usd columns; never re-derive P&L / FX / TASE agorot
 *     (the app's SQL functions already bake those in — re-deriving diverges).
 *   - unrealized P&L is NOT stored → derive market_value_usd − cost_basis_usd.
 *   - Positions list: current_quantity > 0. Realized P&L / dividends: include
 *     closed rows (qty 0 keeps realized). Market value / unrealized: qty > 0 only.
 *   - Scope everything through portfolio_id → portfolios.user_id.
 */

/** Owner scope on the joined `portfolios p`. Empty only when no account id is
 *  set (single-user, read-all — safe solo). */
function userScope(sql: ReturnType<typeof isentrySql>) {
  const id = isentryAccountId();
  return id ? sql`and p.user_id = ${id}` : sql``;
}

export async function listPositions(limit = 200) {
  const sql = isentrySql();
  return sql`
    select p.name as portfolio, h.symbol, h.name, h.exchange, h.currency,
           h.current_quantity, h.average_cost_usd, h.cost_basis_usd,
           h.current_price_usd, h.market_value_usd,
           (h.market_value_usd - h.cost_basis_usd) as unrealized_pnl_usd,
           h.realized_pnl_usd, h.total_dividends_usd, h.last_transaction_date
    from portfolio_holdings_computed h
    join portfolios p on p.id = h.portfolio_id
    where h.current_quantity > 0 ${userScope(sql)}
    order by h.market_value_usd desc nulls last
    limit ${limit}`;
}

export async function listTransactions(limit = 100) {
  const sql = isentrySql();
  // LEFT JOIN the adjusted mirror for split/FX-adjusted USD values.
  return sql`
    select p.name as portfolio, t.transaction_date, t.transaction_type, t.symbol,
           t.name, t.quantity, t.price, t.total_amount, t.currency, t.notes,
           a.adjusted_quantity, a.adjusted_price_usd, a.adjusted_total_amount_usd
    from portfolio_transactions t
    join portfolios p on p.id = t.portfolio_id
    left join portfolio_transactions_adjusted a on a.original_transaction_id = t.id
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

/** One-row roll-up (USD). Market value / unrealized over OPEN positions; realized
 *  P&L and dividends include closed positions (they retain those figures). */
export async function portfolioSummary() {
  const sql = isentrySql();
  const [row] = await sql`
    select count(*) filter (where h.current_quantity > 0)::int          as positions,
           sum(h.market_value_usd) filter (where h.current_quantity > 0) as market_value_usd,
           sum(h.cost_basis_usd)   filter (where h.current_quantity > 0) as cost_basis_usd,
           sum(h.market_value_usd - h.cost_basis_usd)
             filter (where h.current_quantity > 0)                       as unrealized_pnl_usd,
           sum(h.realized_pnl_usd)                                       as realized_pnl_usd,
           sum(h.total_dividends_usd)                                    as dividends_usd
    from portfolio_holdings_computed h
    join portfolios p on p.id = h.portfolio_id
    where true ${userScope(sql)}`;
  return row ?? null;
}

/** Cash / savings + loans (user-scoped, standalone from portfolios). */
export async function listSavings() {
  const sql = isentrySql();
  const id = isentryAccountId();
  return id
    ? sql`select account_name, savings_amount, currency, has_loan, loan_amount, monthly_payment
          from savings_accounts where user_id = ${id}`
    : sql`select account_name, savings_amount, currency, has_loan, loan_amount, monthly_payment
          from savings_accounts`;
}
