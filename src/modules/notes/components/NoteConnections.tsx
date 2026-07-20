"use client";

import { useTransition } from "react";
import Link from "next/link";
import {
  BrainCircuit,
  BookOpen,
  Check,
  FolderKanban,
  Lightbulb,
  NotebookPen,
} from "lucide-react";
import type { Connection, Connections } from "@/core/embeddings";
import { cn } from "@/core/ui/cn";
import { setNoteProject } from "../actions";

const KIND_META: Record<
  Connection["kind"],
  { color: string; icon: typeof NotebookPen; label: string }
> = {
  note: { color: "var(--color-violet)", icon: NotebookPen, label: "note" },
  idea: { color: "var(--color-gold)", icon: Lightbulb, label: "idea" },
  knowledge: { color: "var(--color-orchid)", icon: BrainCircuit, label: "knowledge" },
  vault: { color: "var(--color-violet)", icon: BookOpen, label: "vault" },
  project: { color: "var(--color-solar)", icon: FolderKanban, label: "project" },
  task: { color: "var(--color-ion)", icon: NotebookPen, label: "task" },
};

export function NoteConnections({
  noteId,
  connections,
}: {
  noteId: string;
  connections: Connections;
}) {
  const [pending, startTransition] = useTransition();
  const { projectSuggestion, related } = connections;

  if (!projectSuggestion && related.length === 0) {
    return (
      <section className="glass mt-4 rounded-xl p-5">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-faint">
          connections
        </p>
        <p className="mt-2 text-xs text-ink-faint">
          No strong connections yet — as you capture more notes, ideas and
          knowledge, AIOS surfaces the ones that genuinely relate here.
        </p>
      </section>
    );
  }

  return (
    <div className="mt-4 flex flex-col gap-3">
      {projectSuggestion && (
        <section className="glass glass-edge rounded-xl p-4">
          <div className="flex flex-wrap items-center gap-3">
            <FolderKanban className="size-4 shrink-0 text-solar" />
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-solar">
                {projectSuggestion.confidence === "strong"
                  ? "looks like it belongs to"
                  : "maybe part of"}
              </p>
              <p className="truncate text-sm font-medium text-ink">
                {projectSuggestion.name}
              </p>
            </div>
            <Link
              href={`/m/projects/${projectSuggestion.id}`}
              className="font-mono text-[10px] uppercase tracking-widest text-ink-faint transition hover:text-ink"
            >
              view
            </Link>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await setNoteProject(noteId, projectSuggestion.id);
                })
              }
              className="flex items-center gap-1.5 rounded-lg bg-solar/15 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-solar transition hover:bg-solar/25 disabled:opacity-40"
            >
              <Check className="size-3" />
              {pending ? "…" : "link"}
            </button>
          </div>
        </section>
      )}

      {related.length > 0 && (
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
      )}
    </div>
  );
}
