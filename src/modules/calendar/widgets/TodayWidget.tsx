import Link from "next/link";
import { getAgenda } from "../agenda";

export async function TodayWidget() {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const items = await getAgenda(start, end);

  if (items.length === 0) {
    return (
      <p className="font-mono text-[11px] uppercase tracking-widest text-ink-faint">
        today is clear
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {items.slice(0, 5).map((it) => (
        <li key={`${it.kind}:${it.id}`}>
          <Link
            href={it.href}
            className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition hover:bg-white/4"
          >
            <span className="dot shrink-0" style={{ color: it.accent }} />
            <span className="w-14 shrink-0 font-mono text-[10px] tabular-nums text-ink-faint">
              {it.allDay
                ? "all day"
                : it.at.toLocaleTimeString(undefined, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
            </span>
            <span className="flex-1 truncate text-sm text-ink-dim transition group-hover:text-ink">
              {it.title}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
