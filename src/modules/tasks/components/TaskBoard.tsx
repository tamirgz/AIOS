"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowLeft,
  ArrowRight,
  Flame,
  FolderKanban,
  GripVertical,
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
import { TaskEditModal } from "./TaskEditModal";

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

function QuickAdd({ projectRef }: { projectRef?: string }) {
  const [pending, startTransition] = useTransition();
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = () => {
    const title = inputRef.current?.value.trim();
    if (!title) return;
    startTransition(async () => {
      await createTask({ title, priority, projectRef });
      if (inputRef.current) inputRef.current.value = "";
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="glass mb-4 flex items-center gap-2 rounded-xl p-1.5 pl-3 focus-within:glass-edge"
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

function TaskCard({
  task,
  dragging,
  projectName,
  onDragStart,
  onDragEnd,
  onEdit,
  onMoved,
}: {
  task: Task;
  dragging: boolean;
  projectName?: string | null;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onEdit: (task: Task) => void;
  onMoved: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);
  const idx = COLUMNS.findIndex((c) => c.status === task.status);
  const move = (dir: -1 | 1) => {
    const next = COLUMNS[idx + dir]?.status;
    if (!next) return;
    startTransition(async () => {
      await setTaskStatus(task.id, next);
      onMoved();
    });
  };

  // Wire native HTML5 drag imperatively: motion filters the `draggable` prop
  // (and reserves onDragStart/onDragEnd for its own pan gestures) out of the
  // DOM, so we set it on the element itself. This keeps motion.div as the
  // animated node, preserving the layoutId fly-between-columns transition.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.draggable = true;
    const onStart = (e: DragEvent) => {
      if (e.dataTransfer) {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", task.id);
      }
      onDragStart(task.id);
    };
    el.addEventListener("dragstart", onStart);
    el.addEventListener("dragend", onDragEnd);
    return () => {
      el.removeEventListener("dragstart", onStart);
      el.removeEventListener("dragend", onDragEnd);
    };
  }, [task.id, onDragStart, onDragEnd]);

  return (
    <motion.div
      ref={ref}
      layout
      layoutId={task.id}
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: dragging ? 0.3 : pending ? 0.4 : 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ type: "spring", stiffness: 420, damping: 34 }}
      className={cn(
        "group glass rounded-xl p-3.5",
        "cursor-grab active:cursor-grabbing",
      )}
    >
      <div className="flex items-start gap-2">
        <GripVertical className="mt-0.5 size-3.5 shrink-0 text-ink-faint/50 transition group-hover:text-ink-faint" />
        <span
          className={cn(
            "mt-0.5 font-mono text-[9px] uppercase",
            PRIORITY_STYLE[task.priority],
          )}
          title={`${task.priority} priority`}
        >
          ▲
        </span>
        <div className="min-w-0 flex-1">
          <p
            onClick={() => onEdit(task)}
            title="Click to edit"
            className={cn(
              "cursor-pointer text-sm leading-snug transition hover:text-ink",
              task.status === "done" ? "text-ink-faint line-through" : "text-ink-dim",
            )}
          >
            {task.title}
          </p>
          {projectName && (
            <Link
              href={`/m/projects/${task.projectRef!.split(":")[1]}`}
              onClick={(e) => e.stopPropagation()}
              className="mt-1.5 inline-flex w-fit items-center gap-1 rounded-md border border-white/8 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest text-ink-faint transition hover:border-ion/30 hover:text-ion"
            >
              <FolderKanban className="size-2.5" />
              {projectName}
            </Link>
          )}
        </div>
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
          onClick={() =>
            startTransition(async () => {
              await deleteTask(task.id);
              onMoved();
            })
          }
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

export function TaskBoard({
  tasks,
  projectOptions = [],
  /** Preset for this board's own QuickAdd — e.g. "projects:<id>" when embedded on a project page. */
  quickAddProjectRef,
  /** Hide the internal QuickAdd — set when the host page already has its own (e.g. ProjectTaskQuickAdd). */
  hideQuickAdd = false,
  /** Hide the per-card project badge — set when every task shown is obviously already in this project. */
  hideProjectBadge = false,
}: {
  tasks: Task[];
  projectOptions?: { id: string; name: string }[];
  quickAddProjectRef?: string;
  hideQuickAdd?: boolean;
  hideProjectBadge?: boolean;
}) {
  const router = useRouter();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStatus, setOverStatus] = useState<TaskStatus | null>(null);
  const [editing, setEditing] = useState<Task | null>(null);
  const [, startMove] = useTransition();

  const projectNames = useMemo(
    () => Object.fromEntries(projectOptions.map((p) => [p.id, p.name])),
    [projectOptions],
  );

  const dragged = dragId ? tasks.find((t) => t.id === dragId) ?? null : null;

  // Stable so TaskCard's drag-wiring effect doesn't re-run every render.
  const onDragStart = useCallback((id: string) => setDragId(id), []);
  const onDragEnd = useCallback(() => {
    setDragId(null);
    setOverStatus(null);
  }, []);
  // Any move/delete/edit can change which board(s) a task belongs to (a
  // different project's page, /m/tasks, the project cockpit) — refresh so
  // every host page re-syncs regardless of which route revalidatePath hit.
  const onMoved = useCallback(() => router.refresh(), [router]);

  const drop = (status: TaskStatus) => {
    const id = dragId;
    setDragId(null);
    setOverStatus(null);
    if (!id) return;
    const task = tasks.find((t) => t.id === id);
    if (!task || task.status === status) return;
    startMove(async () => {
      await setTaskStatus(id, status);
      onMoved();
    });
  };

  return (
    <div>
      {!hideQuickAdd && <QuickAdd projectRef={quickAddProjectRef} />}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {COLUMNS.map((col) => {
          const items = tasks.filter((t) => t.status === col.status);
          // A column is a live drop target only when a card from *another*
          // column is being dragged over it.
          const isTarget = !!dragged && dragged.status !== col.status;
          const active = overStatus === col.status && isTarget;
          return (
            <section
              key={col.status}
              onDragOver={(e) => {
                if (!dragId) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = isTarget ? "move" : "none";
                if (isTarget && overStatus !== col.status)
                  setOverStatus(col.status);
              }}
              onDragLeave={(e) => {
                // Ignore leaves that are really just entering a child element.
                if (!e.currentTarget.contains(e.relatedTarget as Node | null))
                  setOverStatus((s) => (s === col.status ? null : s));
              }}
              onDrop={(e) => {
                e.preventDefault();
                drop(col.status);
              }}
              className={cn(
                "min-h-40 rounded-2xl p-2 transition-colors",
                active
                  ? "bg-white/[0.03] outline outline-1 outline-dashed"
                  : "outline-none",
              )}
              style={active ? { outlineColor: col.accent } : undefined}
            >
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
                    <TaskCard
                      key={t.id}
                      task={t}
                      dragging={dragId === t.id}
                      projectName={
                        hideProjectBadge || !t.projectRef
                          ? null
                          : (projectNames[t.projectRef.split(":")[1]] ?? null)
                      }
                      onDragStart={onDragStart}
                      onDragEnd={onDragEnd}
                      onEdit={setEditing}
                      onMoved={onMoved}
                    />
                  ))}
                </AnimatePresence>
                {items.length === 0 && (
                  <div
                    className={cn(
                      "rounded-xl border border-dashed py-8 text-center font-mono text-[10px] uppercase tracking-widest transition-colors",
                      active
                        ? "border-white/20 text-ink-dim"
                        : "border-white/6 text-ink-faint",
                    )}
                  >
                    {active ? "drop here" : "empty"}
                  </div>
                )}
              </div>
            </section>
          );
        })}
      </div>

      {editing && (
        <TaskEditModal
          task={editing}
          projectOptions={projectOptions}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
