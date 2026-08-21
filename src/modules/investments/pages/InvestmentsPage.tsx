import { GlassPanel } from "@/core/ui/GlassPanel";
import { isentryConfigured } from "../db";
import { listPositions, portfolioSummary } from "../queries";

/**
 * Investments dashboard. Connect-state until iSentry is wired, then a summary
 * strip + holdings table. Charts (allocation, value-over-time from
 * portfolio.performance) come next, using the dataviz + RTL finance skills.
 */
const usd = (v: unknown) =>
  v == null || v === ""
    ? "—"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(Number(v));

const num = (v: unknown, d = 2) =>
  v == null || v === "" ? "—" : Number(v).toLocaleString("en-US", { maximumFractionDigits: d });

export async function InvestmentsPage() {
  if (!isentryConfigured()) {
    return (
      <GlassPanel className="px-8 py-16 text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.35em] text-flare">
          iSentry not connected
        </p>
        <p className="mx-auto mt-4 max-w-md text-sm text-ink-dim">
          Set <code className="text-ink">ISENTRY_DATABASE_URL</code> (a read-only
          Supabase connection string) in <code className="text-ink">.env.local</code>{" "}
          and restart. Then ask ⌘K about your portfolio, or trigger the
          Investment-insight agent.
        </p>
      </GlassPanel>
    );
  }

  let positions: Record<string, unknown>[] = [];
  let summary: Record<string, unknown> | null = null;
  let error = "";
  try {
    [positions, summary] = await Promise.all([
      listPositions(200) as Promise<Record<string, unknown>[]>,
      portfolioSummary() as Promise<Record<string, unknown> | null>,
    ]);
  } catch (e) {
    error = String(e);
  }

  if (error) {
    return (
      <GlassPanel className="px-8 py-16 text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.35em] text-flare">
          could not read iSentry
        </p>
        <p className="mx-auto mt-4 max-w-lg text-sm text-ink-dim">{error}</p>
      </GlassPanel>
    );
  }

  const stat = (label: string, value: string) => (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-ink-faint">
        {label}
      </span>
      <span className="text-lg text-ink">{value}</span>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-lg text-ink">Investments</h1>
        <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-ink-faint">
          from iSentry
        </span>
      </div>

      {summary && (
        <GlassPanel className="flex flex-wrap gap-x-10 gap-y-4 px-6 py-5">
          {stat("positions", num(summary.positions, 0))}
          {stat("market value", usd(summary.market_value_usd))}
          {stat("cost basis", usd(summary.cost_basis_usd))}
          {stat("unrealized P&L", usd(summary.unrealized_pnl_usd))}
          {stat("realized P&L", usd(summary.realized_pnl_usd))}
          {stat("dividends", usd(summary.dividends_usd))}
        </GlassPanel>
      )}

      <GlassPanel className="overflow-x-auto p-0">
        {positions.length === 0 ? (
          <p className="px-8 py-16 text-center text-sm text-ink-dim">
            No holdings returned — check ISENTRY_ACCOUNT_ID scoping.
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/8 text-ink-faint">
                {["Symbol", "Qty", "Price", "Market value", "Unrealized P&L", "Ccy"].map(
                  (h) => (
                    <th
                      key={h}
                      className="px-3 py-2 font-mono text-[10px] uppercase tracking-widest"
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {positions.map((r, i) => (
                <tr key={i} className="border-b border-white/5 text-ink-dim">
                  <td className="px-3 py-2 text-ink">{String(r.symbol ?? "")}</td>
                  <td className="px-3 py-2">{num(r.current_quantity, 4)}</td>
                  <td className="px-3 py-2">{usd(r.current_price_usd)}</td>
                  <td className="px-3 py-2">{usd(r.market_value_usd)}</td>
                  <td className="px-3 py-2">{usd(r.unrealized_pnl_usd)}</td>
                  <td className="px-3 py-2 font-mono text-[11px] text-ink-faint">
                    {String(r.currency ?? "")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </GlassPanel>
    </div>
  );
}
