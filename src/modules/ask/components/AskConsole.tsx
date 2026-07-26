"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { motion } from "motion/react";
import {
  ArrowUp,
  Bell,
  CheckSquare,
  BookOpen,
  ChevronDown,
  FileText,
  FolderKanban,
  History,
  Lightbulb,
  Paperclip,
  Sparkles,
  X,
} from "lucide-react";
import { cn } from "@/core/ui/cn";
import { ask, deleteAskHistoryEntry } from "../actions";
import type { AskAnswer, AskSource } from "../answer";
import type { AskHistoryEntry } from "../schema";

const KIND_ICON: Record<string, typeof FileText> = {
  note: FileText,
  knowledge: BookOpen,
  vault: BookOpen,
  idea: Lightbulb,
  task: CheckSquare,
  notion: FileText,
  file: Paperclip,
  project: FolderKanban,
  attention: Bell,
};

/** Render answer text with [n] turned into clickable citation chips. */
function CitedAnswer({ text, sources }: { text: string; sources: AskSource[] }) {
  const byN = new Map(sources.map((s) => [s.n, s]));
  const parts = text.split(/(\[\d+\])/g);
  return (
    <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink">
      {parts.map((part, i) => {
        const m = part.match(/^\[(\d+)\]$/);
        if (m) {
          const s = byN.get(Number(m[1]));
          if (s)
            return (
              <Link
                key={i}
                href={s.href}
                title={s.title}
                className="mx-0.5 rounded bg-plasma/15 px-1 font-mono text-[11px] text-plasma align-super transition hover:bg-plasma/30"
              >
                {m[1]}
              </Link>
            );
        }
        return <span key={i}>{part}</span>;
      })}
    </p>
  );
}

function formatWhen(d: Date | string): string {
  return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function AskConsole({ initialHistory }: { initialHistory: AskHistoryEntry[] }) {
  const [pending, start] = useTransition();
  const [, startDelete] = useTransition();
  const [result, setResult] = useState<AskAnswer | null>(null);
  const [asked, setAsked] = useState("");
  const [history, setHistory] = useState<AskHistoryEntry[]>(initialHistory);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const submit = () => {
    const q = inputRef.current?.value.trim();
    if (!q || pending) return;
    setAsked(q);
    setResult(null);
    setActiveId(null);
    start(async () => {
      const r = await ask(q);
      setResult(r);
      if (r.historyId) {
        setActiveId(r.historyId);
        setHistory((prev) => [
          {
            id: r.historyId!,
            query: q,
            answer: r.answer,
            sources: r.sources,
            model: r.model || null,
            createdAt: new Date(),
          },
          ...prev,
        ]);
      }
      if (inputRef.current) inputRef.current.value = "";
    });
  };

  // Instant — no retrieval, no LLM call, just the already-computed answer.
  const loadFromHistory = (entry: AskHistoryEntry) => {
    setAsked(entry.query);
    setResult({ answer: entry.answer, sources: entry.sources, model: entry.model ?? "" });
    setActiveId(entry.id);
  };

  const deleteEntry = (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setHistory((prev) => prev.filter((h) => h.id !== id));
    if (activeId === id) {
      setActiveId(null);
      setAsked("");
      setResult(null);
    }
    startDelete(async () => {
      await deleteAskHistoryEntry(id);
    });
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="text-center">
        <Sparkles className="mx-auto mb-2 size-6 text-plasma" />
        <h1 className="font-display text-2xl font-semibold text-ink">Ask your knowledge</h1>
        <p className="mt-1 text-sm text-ink-dim">
          Cited answers from your notes, knowledge, vault, ideas, tasks and files — nothing from outside.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="glass flex items-end gap-2 rounded-2xl p-2 pl-4 focus-within:glass-edge"
      >
        <textarea
          ref={inputRef}
          rows={1}
          placeholder="Ask anything about what you've saved…"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          className="max-h-40 min-h-[2.5rem] flex-1 resize-none bg-transparent py-2 text-sm text-ink outline-none placeholder:text-ink-faint"
          autoFocus
        />
        <button
          type="submit"
          disabled={pending}
          className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-plasma/20 text-plasma transition hover:bg-plasma/30 disabled:opacity-40"
        >
          <ArrowUp className="size-4" />
        </button>
      </form>

      <div>
        <button
          type="button"
          onClick={() => setHistoryOpen((o) => !o)}
          className="flex items-center gap-2 rounded-lg px-1 py-1 font-mono text-[10px] uppercase tracking-widest text-ink-faint transition hover:text-ink-dim"
        >
          <History className="size-3.5" />
          recent questions
          <span className="tabular-nums text-ink-faint">{history.length}</span>
          <ChevronDown className={cn("size-3 transition-transform", historyOpen && "rotate-180")} />
        </button>
        {historyOpen && (
          <div className="mt-2 flex flex-col gap-1.5">
            {history.length === 0 && (
              <p className="py-3 text-center font-mono text-[10px] uppercase tracking-widest text-ink-faint">
                no questions yet
              </p>
            )}
            {history.map((h) => (
              <div
                key={h.id}
                className={cn(
                  "group glass flex items-center gap-2 rounded-xl px-3 py-2 transition",
                  activeId === h.id ? "bg-plasma/8" : "hover:bg-white/4",
                )}
              >
                <button
                  type="button"
                  onClick={() => loadFromHistory(h)}
                  title="Show this answer — already computed, no re-query"
                  className="min-w-0 flex-1 truncate text-left text-sm text-ink-dim transition hover:text-ink"
                >
                  {h.query}
                </button>
                <span className="shrink-0 font-mono text-[9px] text-ink-faint">
                  {formatWhen(h.createdAt)}
                </span>
                <button
                  type="button"
                  title="Delete this question"
                  onClick={(e) => deleteEntry(h.id, e)}
                  className="shrink-0 rounded-md p-1 text-ink-faint opacity-0 transition group-hover:opacity-100 hover:bg-flare/10 hover:text-flare"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {asked && (
        <div className="flex flex-col gap-4">
          <p className="font-mono text-[11px] uppercase tracking-widest text-ink-faint">
            {asked}
          </p>

          {pending && (
            <div className="flex items-center gap-2 text-sm text-ink-dim">
              <span className="size-1.5 animate-ping rounded-full bg-plasma" />
              searching your corpus & composing a cited answer…
            </div>
          )}

          {result && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col gap-5"
            >
              <div className="glass rounded-2xl p-5">
                <CitedAnswer text={result.answer} sources={result.sources} />
                {result.model && (
                  <p className="mt-3 border-t border-white/6 pt-2 font-mono text-[9px] uppercase tracking-widest text-ink-faint">
                    {result.model}
                  </p>
                )}
              </div>

              {result.sources.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <p className="px-1 font-mono text-[10px] uppercase tracking-[0.2em] text-ink-dim">
                    sources
                  </p>
                  {result.sources.map((s) => {
                    const Icon = KIND_ICON[s.kind] ?? FileText;
                    return (
                      <Link
                        key={s.n}
                        href={s.href}
                        className="glass group flex items-center gap-3 rounded-xl p-3 transition hover:bg-white/4"
                      >
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-plasma/10 font-mono text-[10px] text-plasma">
                          {s.n}
                        </span>
                        <Icon className="size-3.5 shrink-0 text-ink-faint" />
                        <span className="min-w-0 flex-1 truncate text-sm text-ink-dim transition group-hover:text-ink">
                          {s.title}
                        </span>
                        <span className={cn("shrink-0 font-mono text-[9px] uppercase tracking-widest text-ink-faint")}>
                          {s.kind}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}
        </div>
      )}
    </div>
  );
}
