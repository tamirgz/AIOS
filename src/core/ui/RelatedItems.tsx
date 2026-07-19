import Link from "next/link";
import { relatedTo } from "@/core/embeddings";

const KIND_COLOR: Record<string, string> = {
  note: "var(--color-violet)",
  knowledge: "var(--color-orchid)",
  task: "var(--color-ion)",
  vault: "var(--color-violet)",
  idea: "var(--color-gold)",
};

/** Server component: semantic nearest-neighbours panel. */
export async function RelatedItems({
  kind,
  id,
}: {
  kind: "note" | "knowledge";
  id: string;
}) {
  let hits: Awaited<ReturnType<typeof relatedTo>> = [];
  try {
    hits = await relatedTo(kind, id, 5);
  } catch {
    return null; // embeddings not ready / ollama down — hide quietly
  }
  const relevant = hits.filter((h) => h.distance < 0.65);
  if (relevant.length === 0) return null;

  return (
    <section className="glass mt-4 rounded-xl p-5">
      <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.3em] text-ink-faint">
        related — by meaning
      </p>
      <ul className="flex flex-col gap-1.5">
        {relevant.map((h) => (
          <li key={`${h.kind}:${h.id}`}>
            <Link
              href={h.href}
              className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition hover:bg-white/4"
            >
              <span className="dot shrink-0" style={{ color: KIND_COLOR[h.kind] }} />
              <span className="flex-1 truncate text-sm text-ink-dim transition group-hover:text-ink">
                {h.title}
              </span>
              <span
                className="font-mono text-[9px] uppercase tracking-widest"
                style={{ color: KIND_COLOR[h.kind] }}
              >
                {h.kind}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
