"use client";

import { useRef, useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  Clapperboard,
  FileText,
  Lightbulb,
  PenLine,
  Plus,
  Trash2,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/core/ui/cn";
import {
  createContent,
  deleteContent,
  setContentStage,
} from "../actions";
import type { ContentItem, ContentKind, ContentStage } from "../schema";

const COLUMNS: { stage: ContentStage; label: string; accent: string }[] = [
  { stage: "idea", label: "Spark", accent: "var(--color-ion)" },
  { stage: "draft", label: "Drafting", accent: "var(--color-solar)" },
  { stage: "review", label: "In review", accent: "var(--color-violet)" },
  { stage: "published", label: "Live", accent: "var(--color-plasma)" },
];

const KIND_ICON: Record<ContentKind, LucideIcon> = {
  post: PenLine,
  article: FileText,
  video: Clapperboard,
  idea: Lightbulb,
};

const KIND_CYCLE: ContentKind[] = ["post", "article", "video", "idea"];

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formatPublishAt(d: Date) {
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

function isWithinSevenDays(d: Date) {
  const diff = d.getTime() - Date.now();
  return diff <= 7 * 86_400_000;
}

function QuickAdd() {
  const [pending, startTransition] = useTransition();
  const [kind, setKind] = useState<ContentKind>("post");
  const inputRef = useRef<HTMLInputElement>(null);
  const KindIcon = KIND_ICON[kind];

  const submit = () => {
    const title = inputRef.current?.value.trim();
    if (!title) return;
    startTransition(async () => {
      await createContent({ title, kind });
      if (inputRef.current) inputRef.current.value = "";
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="glass mb-5 flex items-center gap-2 rounded-xl p-2 pl-4 focus-within:glass-edge"
    >
      <Plus className="size-4 text-plasma" />
      <input
        ref={inputRef}
        placeholder="Capture a content idea… (Enter to commit)"
        className="h-9 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
        disabled={pending}
        autoFocus
      />
      <button
        type="button"
        onClick={() =>
          setKind(
            (k) => KIND_CYCLE[(KIND_CYCLE.indexOf(k) + 1) % KIND_CYCLE.length],
          )
        }
        title={`Kind: ${kind} (click to cycle)`}
        className="flex items-center gap-1.5 rounded-lg border border-white/8 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-widest text-ink-dim transition hover:bg-white/5"
      >
        <KindIcon className="size-3.5" />
        {kind}
      </button>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-plasma/15 px-4 py-2 font-mono text-[11px] uppercase tracking-widest text-plasma transition hover:bg-plasma/25 disabled:opacity-40"
      >
        {pending ? "…" : "add"}
      </button>
    </form>
  );
}

function ContentCard({ item }: { item: ContentItem }) {
  const [pending, startTransition] = useTransition();
  const idx = COLUMNS.findIndex((c) => c.stage === item.stage);
  const KindIcon = KIND_ICON[item.kind];
  const move = (dir: -1 | 1) => {
    const next = COLUMNS[idx + dir]?.stage;
    if (!next) return;
    startTransition(async () => {
      await setContentStage(item.id, next);
    });
  };

  return (
    <motion.div
      layout
      layoutId={item.id}
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: pending ? 0.4 : 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ type: "spring", stiffness: 420, damping: 34 }}
      className="group glass rounded-xl p-3.5"
    >
      <div className="flex items-start gap-2">
        <KindIcon
          className="mt-0.5 size-3.5 shrink-0 text-ink-dim"
          aria-label={item.kind}
        />
        <p className="flex-1 text-sm leading-snug">{item.title}</p>
      </div>
      {item.publishAt && (
        <div className="mt-2 pl-5.5">
          <span
            className={cn(
              "rounded-md border border-white/8 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest",
              isWithinSevenDays(item.publishAt)
                ? "text-solar"
                : "text-ink-faint",
            )}
          >
            {formatPublishAt(item.publishAt)}
          </span>
        </div>
      )}
      <div className="mt-2.5 flex items-center justify-between opacity-0 transition-opacity group-hover:opacity-100">
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => move(-1)}
            disabled={idx === 0 || pending}
            title="Move left"
            className="rounded-md p-1.5 text-ink-dim transition hover:bg-white/6 hover:text-ink disabled:invisible"
          >
            <ArrowLeft className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => move(1)}
            disabled={idx === COLUMNS.length - 1 || pending}
            title="Move right"
            className="rounded-md p-1.5 text-ink-dim transition hover:bg-white/6 hover:text-ink disabled:invisible"
          >
            <ArrowRight className="size-3.5" />
          </button>
        </div>
        <button
          type="button"
          onClick={() => startTransition(() => deleteContent(item.id))}
          disabled={pending}
          title="Delete content item"
          className="rounded-md p-1.5 text-ink-faint transition hover:bg-flare/10 hover:text-flare"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </motion.div>
  );
}

export function ContentBoard({ items }: { items: ContentItem[] }) {
  return (
    <div>
      <QuickAdd />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((col) => {
          const colItems = items.filter((c) => c.stage === col.stage);
          return (
            <section key={col.stage} className="min-h-40">
              <header className="mb-3 flex items-center gap-2 px-1">
                <span className="dot" style={{ color: col.accent }} />
                <h2 className="font-display text-sm font-medium uppercase tracking-[0.2em] text-ink-dim">
                  {col.label}
                </h2>
                <span className="ml-auto font-mono text-xs tabular-nums text-ink-faint">
                  {colItems.length}
                </span>
              </header>
              <div className="flex flex-col gap-2.5">
                <AnimatePresence mode="popLayout">
                  {colItems.map((c) => (
                    <ContentCard key={c.id} item={c} />
                  ))}
                </AnimatePresence>
                {colItems.length === 0 && (
                  <div className="rounded-xl border border-dashed border-white/6 py-8 text-center font-mono text-[10px] uppercase tracking-widest text-ink-faint">
                    empty
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
