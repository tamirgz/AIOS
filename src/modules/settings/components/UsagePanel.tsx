import { sql as dsql } from "drizzle-orm";
import { db } from "@/core/db/client";

type UsageRow = {
  agent_name: string;
  runs: number;
  failures: number;
  tokens_in: number;
  tokens_out: number;
} & Record<string, unknown>;

/** Per-agent token/run aggregates for the last 30 days. */
export async function UsagePanel() {
  const rows = await db.execute<UsageRow>(dsql`
    select coalesce(a.name, '(deleted agent)') as agent_name,
           count(*)::int as runs,
           count(*) filter (where r.status in ('failed','timed_out'))::int as failures,
           coalesce(sum(r.tokens_in), 0)::int as tokens_in,
           coalesce(sum(r.tokens_out), 0)::int as tokens_out
      from agent_runs r
      left join agents a on a.id = r.agent_id
     where r.created_at > now() - interval '30 days'
     group by 1
     order by tokens_out desc
  `);
  const list = [...rows];
  const fmt = (n: number) =>
    n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);

  return (
    <div className="flex flex-col gap-2.5">
      <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-faint">
        agent usage — last 30 days
      </p>
      <div className="glass rounded-xl p-3">
        {list.length === 0 ? (
          <p className="py-3 text-center font-mono text-[10px] uppercase tracking-widest text-ink-faint">
            no runs yet
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="font-mono text-[9px] uppercase tracking-widest text-ink-faint">
                <th className="pb-2 text-left font-normal">agent</th>
                <th className="pb-2 text-right font-normal">runs</th>
                <th className="pb-2 text-right font-normal">fails</th>
                <th className="pb-2 text-right font-normal">tok in</th>
                <th className="pb-2 text-right font-normal">tok out</th>
              </tr>
            </thead>
            <tbody>
              {list.map((r) => (
                <tr key={r.agent_name} className="border-t border-white/4">
                  <td className="py-1.5 text-ink-dim">{r.agent_name}</td>
                  <td className="py-1.5 text-right font-mono text-xs tabular-nums text-ink">
                    {r.runs}
                  </td>
                  <td className="py-1.5 text-right font-mono text-xs tabular-nums">
                    <span className={r.failures > 0 ? "text-flare" : "text-ink-faint"}>
                      {r.failures}
                    </span>
                  </td>
                  <td className="py-1.5 text-right font-mono text-xs tabular-nums text-ink-dim">
                    {fmt(r.tokens_in)}
                  </td>
                  <td className="py-1.5 text-right font-mono text-xs tabular-nums text-ink-dim">
                    {fmt(r.tokens_out)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
