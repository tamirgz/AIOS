import { GlassPanel } from "@/core/ui/GlassPanel";
import { isentryConfigured } from "../db";
import { listPositions } from "../queries";

/**
 * Investments dashboard. Skeleton: a connect-state until iSentry is wired, then
 * a raw holdings table. Real charts (allocation, performance) come once the
 * Supabase schema is mapped — they'll use the dataviz + RTL finance skills.
 */
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

  let rows: Record<string, unknown>[] = [];
  let error = "";
  try {
    rows = (await listPositions(200)) as Record<string, unknown>[];
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

  const cols = rows.length ? Object.keys(rows[0]) : [];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between">
        <h1 className="text-lg text-ink">Investments</h1>
        <span className="font-mono text-[11px] uppercase tracking-[0.25em] text-ink-faint">
          {rows.length} holdings · from iSentry
        </span>
      </div>
      <GlassPanel className="overflow-x-auto p-0">
        {rows.length === 0 ? (
          <p className="px-8 py-16 text-center text-sm text-ink-dim">
            No positions returned — check the schema map in queries.ts.
          </p>
        ) : (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/8">
                {cols.map((c) => (
                  <th
                    key={c}
                    className="px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-ink-faint"
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-white/5 text-ink-dim">
                  {cols.map((c) => (
                    <td key={c} className="px-3 py-2">
                      {String(r[c] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </GlassPanel>
    </div>
  );
}
