import Link from "next/link";
import { listPeople } from "../queries";

function lastMet(d: Date | null): string {
  if (!d) return "—";
  const days = Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1d";
  return `${days}d`;
}

export async function PeopleWidget() {
  const people = (await listPeople()).slice(0, 5);

  if (people.length === 0) {
    return (
      <p className="font-mono text-[11px] uppercase tracking-widest text-ink-faint">
        no people yet
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {people.map((p) => (
        <li key={p.id}>
          <Link
            href={`/m/people/${p.id}`}
            className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition hover:bg-white/4"
          >
            <span className="flex-1 truncate text-sm text-ink-dim transition group-hover:text-ink">
              {p.name ?? p.email}
            </span>
            {p.openFollowups > 0 && (
              <span className="shrink-0 font-mono text-[9px] text-solar">
                {p.openFollowups}●
              </span>
            )}
            <span className="shrink-0 font-mono text-[9px] uppercase tracking-widest tabular-nums text-ink-faint">
              {lastMet(p.lastSeenAt)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
