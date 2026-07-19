import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/core/db/client";
import { ideas } from "../schema";
import { STAGE_META, STAGE_ORDER } from "../components/ideaMeta";

export async function IdeasPipelineWidget() {
  const [counts] = await db
    .select({
      spark: sql<number>`count(*) filter (where ${ideas.stage} = 'spark')`,
      exploring: sql<number>`count(*) filter (where ${ideas.stage} = 'exploring')`,
      validated: sql<number>`count(*) filter (where ${ideas.stage} = 'validated')`,
      parked: sql<number>`count(*) filter (where ${ideas.stage} = 'parked')`,
    })
    .from(ideas);
  const byStage = STAGE_ORDER.map((s) => ({
    stage: s,
    n: Number(counts[s]),
  }));
  const total = byStage.reduce((a, b) => a + b.n, 0);

  return (
    <Link href="/m/ideas" className="flex h-full flex-col justify-between gap-3">
      <p className="font-display text-4xl font-semibold tabular-nums text-ink">
        {total}
        <span className="ml-2 text-sm font-normal tracking-widest text-ink-dim">
          ideas
        </span>
      </p>
      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-white/5">
        {byStage.map(({ stage, n }) => (
          <span
            key={stage}
            style={{
              width: `${total ? Math.max((n / total) * 100, n > 0 ? 4 : 0) : 0}%`,
              background: STAGE_META[stage].accent,
            }}
          />
        ))}
      </div>
      <p className="font-mono text-[10px] uppercase tracking-wider text-ink-faint">
        {byStage.map(({ stage, n }) => `${n} ${stage}`).join(" · ")}
      </p>
    </Link>
  );
}
