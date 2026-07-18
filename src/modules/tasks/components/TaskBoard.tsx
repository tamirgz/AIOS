"use client";

import { useRef, useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  Flame,
  Plus,
  Trash2,
} from "lucide-react";
import { cn } from "@/core/ui/cn";
import {
  createTask,
  deleteTask,
  setTaskStatus,
} from "../actions";
import type { Task, TaskPriority, TaskStatus } from "../schema";

const COLUMNS: { status: TaskStatus; label: string; accent: string }[] = [
  { status: "todo", label: "Queue", accent: "var(--color-ion)" },
  { status: "doing", label: "In flight", accent: "var(--color-solar)" },
  { status: "done", label: "Landed", accent: "var(--color-plasma)" },
];

const PRIORITY_STYLE: Record<TaskPriority, string> = {
  high: "text-flare",
  medium: "text-solar",
  low: "text-ink-faint",
};

function QuickAdd() {
  const [pending, startTransition] = useTransition();
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = () => {
    const title = inputRef.current?.value.trim();
    if (!title) return;
    startTransition(async () => {
      await createTask({ title, priority });
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
        placeholder="Log a new task… (Enter to commit)"
        className="h-9 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
        disabled={pending}
        autoFocus
      />
      <button
        type="button"
        onClick={() =>
          setPriority((p) =>
            p === "medium" ? "high" : p === "high" ? "low" : "medium",
          )
        }
        title={`Priority: ${priority} (click to cycle)`}
        className={cn(
          "flex items-center gap-1.5 rounded-lg border border-white/8 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-widest transition hover:bg-white/5",
          PRIORITY_STYLE[priority],
        )}
      >
        <Flame className="size-3.5" />
        {priority}
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

function TaskCard({ task }: { task: Task }) {
  const [pending, startTransition] = useTransition();
  const idx = COLUMNS.findIndex((c) => c.status === task.status);
  const move = (dir: -1 | 1) => {
    const next = COLUMNS[idx + dir]?.status;
    if (!next) return;
    startTransition(() => setTaskStatus(task.id, next));
  };

  return (
    <motion.div
      layout
      layoutId={task.id}
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: pending ? 0.4 : 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ type: "spring", stiffness: 420, damping: 34 }}
      className="group glass rounded-xl p-3.5"
    >
      <div className="flex items-start gap-2">
        <span
          className={cn(
            "mt-1 font-mono text-[9px] uppercase",
            PRIORITY_STYLE[task.priority],
          )}
          title={`${task.priority} priority`}
        >
          ▲
        </span>
        <p
          className={cn(
            "flex-1 text-sm leading-snug",
            task.status === "done" && "text-ink-faint line-through",
          )}
        >
          {task.title}
        </p>
      </div>
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
          onClick={() => startTransition(() => deleteTask(task.id))}
          disabled={pending}
          title="Delete task"
          className="rounded-md p-1.5 text-ink-faint transition hover:bg-flare/10 hover:text-flare"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    </motion.div>
  );
}

export function TaskBoard({ tasks }: { tasks: Task[] }) {
  return (
    <div>
      <QuickAdd />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {COLUMNS.map((col) => {
          const items = tasks.filter((t) => t.status === col.status);
          return (
            <section key={col.status} className="min-h-40">
              <header className="mb-3 flex items-center gap-2 px-1">
                <span className="dot" style={{ color: col.accent }} />
                <h2 className="font-display text-sm font-medium uppercase tracking-[0.2em] text-ink-dim">
                  {col.label}
                </h2>
                <span className="ml-auto font-mono text-xs tabular-nums text-ink-faint">
                  {items.length}
                </span>
              </header>
              <div className="flex flex-col gap-2.5">
                <AnimatePresence mode="popLayout">
                  {items.map((t) => (
                    <TaskCard key={t.id} task={t} />
                  ))}
                </AnimatePresence>
                {items.length === 0 && (
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
