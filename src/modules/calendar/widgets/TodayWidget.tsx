import Link from "next/link";
import { Video } from "lucide-react";
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
        // The join link is a sibling of the row link, not nested inside it —
        // an <a> inside an <a> is invalid and swallows the inner click.
        <li
          key={`${it.kind}:${it.id}`}
          className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition hover:bg-white/4"
        >
          <Link href={it.href} className="flex min-w-0 flex-1 items-center gap-2.5">
            <span className="dot shrink-0" style={{ color: it.accent }} />
            <span className="w-12 shrink-0 text-right font-mono text-[10px] tabular-nums text-ink-faint">
              {it.allDay
                ? "all day"
                : it.at.toLocaleTimeString(undefined, {
                    hour: "2-digit",
                    minute: "2-digit",
                    hour12: false,
                  })}
            </span>
            <span
              dir="auto"
              className="flex-1 truncate text-left text-sm text-ink-dim transition group-hover:text-ink"
            >
              {it.title}
            </span>
          </Link>
          {it.meetingUrl && (
            <a
              href={it.meetingUrl}
              target="_blank"
              rel="noreferrer"
              title="Join the call"
              className="flex shrink-0 items-center gap-1 rounded-md border border-plasma/25 bg-plasma/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest text-plasma transition hover:bg-plasma/20"
            >
              <Video className="size-3" />
              join
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}
