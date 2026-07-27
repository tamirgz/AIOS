import { sql } from "drizzle-orm";
import { db } from "@/core/db/client";
import { StatCell } from "@/core/ui/StatCell";
import { knowledgeItems } from "../schema";

/** Ambient strip: knowledge base size + anything still processing. */
export async function KnowledgeStat() {
  const [c] = await db
    .select({
      total: sql<number>`count(*)`,
      processing: sql<number>`count(*) filter (where ${knowledgeItems.status} = 'processing')`,
    })
    .from(knowledgeItems);
  const processing = Number(c.processing);
  return (
    <StatCell
      label="Knowledge"
      value={Number(c.total)}
      hint={processing > 0 ? `· ${processing} processing` : "indexed"}
      href="/m/knowledge"
      accent="var(--color-plasma)"
    />
  );
}
