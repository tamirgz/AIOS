import { sql } from "drizzle-orm";
import { db } from "@/core/db/client";
import { contentItems } from "../schema";

const SEGMENTS = [
  { key: "idea", color: "var(--color-ion)" },
  { key: "draft", color: "var(--color-solar)" },
  { key: "review", color: "var(--color-violet)" },
  { key: "published", color: "var(--color-plasma)" },
] as const;

export async function PipelineWidget() {
  const [counts] = await db
    .select({
      idea: sql<number>`count(*) filter (where ${contentItems.stage} = 'idea')`,
      draft: sql<number>`count(*) filter (where ${contentItems.stage} = 'draft')`,
      review: sql<number>`count(*) filter (where ${contentItems.stage} = 'review')`,
      published: sql<number>`count(*) filter (where ${contentItems.stage} = 'published')`,
    })
    .from(contentItems);

  const n = {
    idea: Number(counts.idea),
    draft: Number(counts.draft),
    review: Number(counts.review),
    published: Number(counts.published),
  };
  const total = n.idea + n.draft + n.review + n.published;
  const width = (count: number) =>
    total === 0 ? 25 : Math.max(2, (count / total) * 100);

  return (
    <div className="flex h-full flex-col justify-between gap-4">
      <p className="font-display text-5xl font-semibold tabular-nums text-ink text-glow">
        {total}
        <span className="ml-2 text-sm font-normal tracking-widest text-ink-dim">
          in pipeline
        </span>
      </p>
      <div>
        <div className="flex h-2 gap-px overflow-hidden rounded-full">
          {SEGMENTS.map((seg) => (
            <div
              key={seg.key}
              style={{
                width: `${width(n[seg.key])}%`,
                background: seg.color,
                opacity: n[seg.key] === 0 ? 0.25 : 1,
              }}
            />
          ))}
        </div>
        <p className="mt-2.5 font-mono text-[11px] uppercase tracking-wider text-ink-dim">
          <span className="text-ion">{n.idea} idea</span>
          {" · "}
          <span className="text-solar">{n.draft} draft</span>
          {" · "}
          <span className="text-violet">{n.review} review</span>
          {" · "}
          <span className="text-plasma">{n.published} live</span>
        </p>
      </div>
    </div>
  );
}
