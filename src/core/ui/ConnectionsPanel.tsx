"use client";

import Link from "next/link";
import {
  BookOpen,
  BrainCircuit,
  CheckSquare,
  FolderKanban,
  Lightbulb,
  NotebookPen,
} from "lucide-react";
import type { Connection } from "@/core/embeddings";

const KIND_META: Record<
  Connection["kind"],
  { color: string; icon: typeof NotebookPen; label: string }
> = {
  note: { color: "var(--color-violet)", icon: NotebookPen, label: "note" },
  idea: { color: "var(--color-gold)", icon: Lightbulb, label: "idea" },
  knowledge: {
    color: "var(--color-orchid)",
    icon: BrainCircuit,
    label: "knowledge",
  },
  vault: { color: "var(--color-violet)", icon: BookOpen, label: "vault" },
  project: { color: "var(--color-solar)", icon: FolderKanban, label: "project" },
  task: { color: "var(--color-ion)", icon: CheckSquare, label: "task" },
};

/**
 * Shared "connected — by meaning" list: quality-gated, cross-type related
 * items. Used on note / idea / knowledge detail pages.
 */
export function ConnectionsPanel({
  related,
  emptyHint,
}: {
  related: Connection[];
  emptyHint?: string;
}) {
  if (related.length === 0) {
    return (
      <section className="glass rounded-xl p-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-faint">
          connections
        </p>
        <p className="mt-2 text-xs text-ink-faint">
          {emptyHint ??
            "No strong connections yet — as you capture more, AIOS surfaces the ones that genuinely relate here."}
        </p>
      </section>
    );
  }

  return (
    <section className="glass rounded-xl p-5">
      <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.3em] text-ink-faint">
        connected — by meaning
      </p>
      <ul className="flex flex-col gap-1.5">
        {related.map((c) => {
          const meta = KIND_META[c.kind];
          const Icon = meta.icon;
          const external = c.href.startsWith("obsidian://");
          const inner = (
            <span className="group flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition hover:bg-white/4">
              <Icon
                className="size-3.5 shrink-0"
                style={{ color: meta.color }}
              />
              <span className="flex-1 truncate text-left text-sm text-ink-dim transition group-hover:text-ink">
                {c.title}
              </span>
              <span
                className="shrink-0 font-mono text-[9px] uppercase tracking-widest"
                style={{ color: meta.color }}
              >
                {meta.label}
              </span>
            </span>
          );
          return external ? (
            <li key={`${c.kind}:${c.id}`}>
              <a href={c.href}>{inner}</a>
            </li>
          ) : (
            <li key={`${c.kind}:${c.id}`}>
              <Link href={c.href}>{inner}</Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
