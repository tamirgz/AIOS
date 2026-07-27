import { sql } from "drizzle-orm";
import { db } from "@/core/db/client";
import { StatCell } from "@/core/ui/StatCell";
import { ideas } from "../schema";

/** Ambient strip: idea count + how many are still raw sparks. */
export async function IdeasStat() {
  const [c] = await db
    .select({
      total: sql<number>`count(*)`,
      spark: sql<number>`count(*) filter (where ${ideas.stage} = 'spark')`,
    })
    .from(ideas);
  return (
    <StatCell
      label="Ideas"
      value={Number(c.total)}
      hint={`· ${Number(c.spark)} spark`}
      href="/m/ideas"
      accent="var(--color-solar)"
    />
  );
}
