import Link from "next/link";
import { desc } from "drizzle-orm";
import { db } from "@/core/db/client";
import { knowledgeItems } from "../schema";
import { KIND_META, STATUS_META } from "../components/kindMeta";

export async function RecentKnowledgeWidget() {
  const rows = await db
    .select()
    .from(knowledgeItems)
    .orderBy(desc(knowledgeItems.createdAt))
    .limit(4);

  if (rows.length === 0) {
    return (
      <p className="font-mono text-[11px] uppercase tracking-widest text-ink-faint">
        knowledge base empty — paste something in
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => {
        const kind = KIND_META[r.kind];
        const status = STATUS_META[r.status];
        const Icon = kind.icon;
        return (
          <li key={r.id}>
            <Link
              href={`/m/knowledge/${r.id}`}
              className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition hover:bg-white/4"
            >
              <Icon className="size-3.5" style={{ color: kind.color }} />
              <span className="flex-1 truncate text-sm text-ink-dim transition group-hover:text-ink">
                {r.title ?? r.input.slice(0, 60)}
              </span>
              <span
                className="font-mono text-[9px] uppercase tracking-widest"
                style={{ color: status.color }}
              >
                {status.label}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
