import Link from "next/link";
import { todaySummary } from "../queries";

export async function TodayWidget() {
  const { events, dueTasks, needsYou } = await todaySummary();

  return (
    <Link href="/m/today" className="block">
      <div className="flex items-baseline gap-2">
        <span className="font-display text-3xl font-semibold text-solar text-glow">
          {needsYou}
        </span>
        <span className="font-mono text-[11px] uppercase tracking-widest text-ink-faint">
          need{needsYou === 1 ? "s" : ""} you
        </span>
      </div>
      <p className="mt-2 font-mono text-[9px] uppercase tracking-widest text-ink-faint">
        {events} event{events === 1 ? "" : "s"} · {dueTasks} due today
      </p>
      <p className="mt-3 text-xs text-ink-dim">
        {needsYou === 0
          ? "You're clear — open your plan for the day."
          : "Open Today to plan and clear what needs you."}
      </p>
    </Link>
  );
}
