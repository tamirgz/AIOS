import Link from "next/link";
import { countActiveTasks, listRunningTasks } from "../queries";

export async function WorkbenchWidget() {
  const [counts, running] = await Promise.all([
    countActiveTasks(),
    listRunningTasks(),
  ]);
  const total = counts.running + counts.queued + counts.review;

  if (total === 0) {
    return (
      <Link
        href="/m/workbench"
        className="block font-mono text-[11px] uppercase tracking-widest text-ink-faint transition hover:text-ink-dim"
      >
        nothing delegated — hand something off →
      </Link>
    );
  }

  return (
    <Link href="/m/workbench" className="block">
      <div className="flex items-baseline gap-2">
        <span className="font-display text-3xl font-semibold text-plasma text-glow">
          {counts.running}
        </span>
        <span className="font-mono text-[11px] uppercase tracking-widest text-ink-faint">
          running
        </span>
      </div>
      <div className="mt-2 flex flex-col gap-1">
        {running.map((t) => (
          <p key={t.id} className="truncate text-xs text-ink-dim">
            {t.title}
          </p>
        ))}
      </div>
      <p className="mt-3 font-mono text-[9px] uppercase tracking-widest text-ink-faint">
        {counts.queued} queued · {counts.review} awaiting review
      </p>
    </Link>
  );
}
