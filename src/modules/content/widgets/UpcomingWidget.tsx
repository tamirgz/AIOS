import Link from "next/link";
import { asc, gte } from "drizzle-orm";
import { db } from "@/core/db/client";
import { contentItems } from "../schema";
import { cn } from "@/core/ui/cn";

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export async function UpcomingWidget() {
  const rows = await db
    .select()
    .from(contentItems)
    .where(gte(contentItems.publishAt, new Date(Date.now() - 86_400_000)))
    .orderBy(asc(contentItems.publishAt))
    .limit(4);

  if (rows.length === 0) {
    return (
      <p className="font-mono text-[11px] uppercase tracking-widest text-ink-faint">
        no scheduled publishes
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {rows.map((c) => {
        const publishAt = c.publishAt!;
        const days = Math.ceil(
          (publishAt.getTime() - Date.now()) / 86_400_000,
        );
        const today = days <= 0;
        return (
          <li key={c.id}>
            <Link
              href="/m/content"
              className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition hover:bg-white/4"
            >
              <span className="flex-1 truncate text-sm text-ink-dim transition group-hover:text-ink">
                {c.title}
              </span>
              <span className="font-mono text-[9px] uppercase tracking-widest text-ink-faint">
                {c.kind}
              </span>
              <span className="font-mono text-[10px] tabular-nums text-ink-faint">
                {MONTHS[publishAt.getMonth()]} {publishAt.getDate()}
              </span>
              <span
                className={cn(
                  "rounded-md border border-white/8 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest",
                  today ? "text-plasma" : "text-solar",
                )}
              >
                {today ? "today" : `${days}d`}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
