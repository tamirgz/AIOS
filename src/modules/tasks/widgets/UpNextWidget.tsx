import Link from "next/link";
import { asc, ne } from "drizzle-orm";
import { db } from "@/core/db/client";
import { priorityRank, tasks } from "../schema";
import { cn } from "@/core/ui/cn";

const PRIORITY_COLOR = {
  high: "text-flare",
  medium: "text-solar",
  low: "text-ink-faint",
} as const;

export async function UpNextWidget() {
  const rows = await db
    .select()
    .from(tasks)
    .where(ne(tasks.status, "done"))
    .orderBy(priorityRank, asc(tasks.createdAt))
    .limit(5);

  if (rows.length === 0) {
    return (
      <p className="font-mono text-[11px] uppercase tracking-widest text-ink-faint">
        queue clear — nothing pending
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {rows.map((t) => (
        <li key={t.id}>
          <Link
            href="/m/tasks"
            className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition hover:bg-white/4"
          >
            <span
              className={cn(
                "font-mono text-[9px]",
                PRIORITY_COLOR[t.priority],
              )}
            >
              ▲
            </span>
            <span className="flex-1 truncate text-sm text-ink-dim transition group-hover:text-ink">
              {t.title}
            </span>
            <span className="font-mono text-[9px] uppercase tracking-widest text-ink-faint">
              {t.status}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
