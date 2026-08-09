"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Reorder, useDragControls } from "motion/react";
import { ChevronDown, GripVertical, Layers, ListPlus, Plus, Trash2, Unlink } from "lucide-react";
import { cn } from "@/core/ui/cn";
import { setTaskStatus, deleteTask } from "@/modules/tasks/actions";
import type { Task, TaskStatus } from "@/modules/tasks/schema";
import type { Feature } from "../schema";
import {
  createFeature,
  createFeatureTask,
  deleteFeature,
  reorderFeatures,
  setTaskFeature,
} from "../features-actions";

export interface FeatureGroup {
  feature: Feature;
  tasks: Task[];
}
interface LooseTask {
  id: string;
  title: string;
}

const NEXT_STATUS: Record<TaskStatus, TaskStatus> = {
  todo: "doing",
  doing: "done",
  done: "todo",
};
const STATUS_COLOR: Record<TaskStatus, string> = {
  todo: "var(--color-ink-faint)",
  doing: "var(--color-solar)",
  done: "var(--color-plasma)",
};

function deriveStatus(tasks: Task[]): { label: string; color: string } {
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === "done").length;
  if (total === 0) return { label: "planned", color: "var(--color-ink-faint)" };
  if (done === total) return { label: "done", color: "var(--color-plasma)" };
  return { label: "building", color: "var(--color-solar)" };
}

function TaskRow({ task, projectId }: { task: Task; projectId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      await fn();
      router.refresh();
    });
  return (
    <div className={cn("group flex items-center gap-2.5 py-1.5", pending && "opacity-50")}>
      <button
        type="button"
        title={`Status: ${task.status} — click to advance`}
        onClick={() => run(() => setTaskStatus(task.id, NEXT_STATUS[task.status]))}
        className="shrink-0"
      >
        <span
          className="block size-3 rounded-full border-2"
          style={{
            borderColor: STATUS_COLOR[task.status],
            background: task.status === "done" ? STATUS_COLOR.done : "transparent",
          }}
        />
      </button>
      <span
        className={cn(
          "flex-1 text-sm",
          task.status === "done" ? "text-ink-faint line-through" : "text-ink-dim",
        )}
      >
        {task.title}
      </span>
      <button
        type="button"
        title="Detach from feature (make a loose task)"
        onClick={() => run(() => setTaskFeature(task.id, projectId, null))}
        className="shrink-0 rounded p-1 text-ink-faint opacity-0 transition hover:bg-white/6 hover:text-ink-dim group-hover:opacity-100"
      >
        <Unlink className="size-3" />
      </button>
      <button
        type="button"
        title="Delete task"
        onClick={() => run(() => deleteTask(task.id))}
        className="shrink-0 rounded p-1 text-ink-faint opacity-0 transition hover:bg-flare/10 hover:text-flare group-hover:opacity-100"
      >
        <Trash2 className="size-3" />
      </button>
    </div>
  );
}

function FeatureCard({
  projectId,
  feature,
  tasks,
  looseTasks,
}: { projectId: string; looseTasks: LooseTask[] } & FeatureGroup) {
  const router = useRouter();
  const controls = useDragControls();
  const [pending, start] = useTransition();
  const [pickOpen, setPickOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const done = tasks.filter((t) => t.status === "done").length;
  const total = tasks.length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const status = deriveStatus(tasks);
  // A shipped feature (all tasks done) folds away by default so it stops
  // crowding the active work — expandable, and it reopens if you add a task.
  const isDone = total > 0 && done === total;
  const [collapsed, setCollapsed] = useState(isDone);

  const run = (fn: () => Promise<unknown>) =>
    start(async () => {
      await fn();
      router.refresh();
    });

  const addTask = () => {
    const title = inputRef.current?.value.trim();
    if (!title) return;
    run(async () => {
      await createFeatureTask(feature.id, projectId, title);
      if (inputRef.current) inputRef.current.value = "";
    });
  };

  return (
    <Reorder.Item value={feature.id} dragListener={false} dragControls={controls} className={cn("glass rounded-xl p-4 transition-opacity", collapsed && isDone && "opacity-60")}>
      <div className="mb-2 flex items-center gap-2.5">
        <button
          type="button"
          onPointerDown={(e) => controls.start(e)}
          title="Drag to reorder features"
          className="cursor-grab touch-none text-ink-faint transition hover:text-ink-dim active:cursor-grabbing"
        >
          <GripVertical className="size-3.5" />
        </button>
        <Layers className="size-4 shrink-0 text-ion" />
        <h4 className="font-display text-base font-medium text-ink">{feature.name}</h4>
        <span
          className="rounded-md border px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest"
          style={{ color: status.color, borderColor: `color-mix(in oklab, ${status.color} 40%, transparent)` }}
        >
          {status.label}
        </span>
        <span className="ml-auto font-mono text-[10px] tabular-nums text-ink-faint">
          {done}/{total}
        </span>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? "Expand feature" : "Collapse feature"}
          className="shrink-0 rounded p-1 text-ink-faint transition hover:text-ink-dim"
        >
          <ChevronDown className={cn("size-3.5 transition-transform", collapsed && "-rotate-90")} />
        </button>
        {/* Pull an existing loose task into this feature. */}
        <div className="relative">
          <button
            type="button"
            title="Add an existing loose task to this feature"
            onClick={() => setPickOpen((o) => !o)}
            className="shrink-0 rounded p-1 text-ink-faint transition hover:bg-white/6 hover:text-ion"
          >
            <ListPlus className="size-3.5" />
          </button>
          {pickOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setPickOpen(false)} />
              <div className="glass absolute right-0 top-full z-20 mt-1 max-h-64 w-64 overflow-y-auto rounded-xl p-1.5">
                {looseTasks.length === 0 ? (
                  <p className="px-2 py-1 font-mono text-[9px] uppercase tracking-widest text-ink-faint">
                    no loose tasks to pull in
                  </p>
                ) : (
                  looseTasks.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setPickOpen(false);
                        run(() => setTaskFeature(t.id, projectId, feature.id));
                      }}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-ink-dim transition hover:bg-white/5 hover:text-ink"
                    >
                      <Plus className="size-3 shrink-0 text-ink-faint" />
                      <span className="truncate">{t.title}</span>
                    </button>
                  ))
                )}
              </div>
            </>
          )}
        </div>
        <button
          type="button"
          title="Delete feature (its tasks become loose)"
          onClick={() => run(() => deleteFeature(feature.id, projectId))}
          className="shrink-0 rounded p-1 text-ink-faint transition hover:bg-flare/10 hover:text-flare"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>

      <div className="mb-2 h-1 overflow-hidden rounded-full bg-white/6">
        <div className="h-full rounded-full bg-gradient-to-r from-plasma-dim to-plasma" style={{ width: `${pct}%` }} />
      </div>

      {!collapsed && (
        <>
          {tasks.length > 0 && (
            <div className="flex flex-col divide-y divide-white/4">
              {tasks.map((t) => (
                <TaskRow key={t.id} task={t} projectId={projectId} />
              ))}
            </div>
          )}

          <form
            onSubmit={(e) => { e.preventDefault(); addTask(); }}
            className="mt-2 flex items-center gap-2 border-t border-white/6 pt-2"
          >
            <Plus className="size-3.5 text-ion" />
            <input
              ref={inputRef}
              placeholder="Add a task to this feature…"
              disabled={pending}
              className="h-7 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
            />
          </form>
        </>
      )}
    </Reorder.Item>
  );
}

/** Saved order (from sortOrder) may drift from what's rendered; keep both in sync. */
function reconcile(live: string[], order: string[]): string[] {
  const liveSet = new Set(live);
  return [...order.filter((id) => liveSet.has(id)), ...live.filter((id) => !order.includes(id))];
}

export function ProjectFeatures({
  projectId,
  groups,
  looseTasks,
}: {
  projectId: string;
  groups: FeatureGroup[];
  looseTasks: LooseTask[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [, startSave] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const liveIds = groups.map((g) => g.feature.id);
  const [order, setOrder] = useState<string[]>(liveIds);
  const display = reconcile(liveIds, order);
  const byId = new Map(groups.map((g) => [g.feature.id, g]));

  const addFeature = () => {
    const name = inputRef.current?.value.trim();
    if (!name) return;
    start(async () => {
      await createFeature(projectId, name);
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 px-1">
        <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-ink-faint">
          features
        </span>
        <span className="font-mono text-xs tabular-nums text-ink-faint">{groups.length}</span>
      </div>

      <Reorder.Group
        axis="y"
        values={display}
        onReorder={(next) => {
          setOrder(next);
          startSave(() => reorderFeatures(projectId, next));
        }}
        className="flex flex-col gap-3"
      >
        {display.map((id) => {
          const g = byId.get(id);
          return g ? (
            <FeatureCard
              key={id}
              projectId={projectId}
              feature={g.feature}
              tasks={g.tasks}
              looseTasks={looseTasks}
            />
          ) : null;
        })}
      </Reorder.Group>

      <form
        onSubmit={(e) => { e.preventDefault(); addFeature(); }}
        className="glass flex items-center gap-2 rounded-xl p-2 pl-4 focus-within:glass-edge"
      >
        <Layers className="size-4 text-ion" />
        <input
          ref={inputRef}
          placeholder="New feature… (groups multiple tasks)"
          disabled={pending}
          className="h-9 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-ion/15 px-4 py-2 font-mono text-[11px] uppercase tracking-widest text-ion transition hover:bg-ion/25 disabled:opacity-40"
        >
          {pending ? "…" : "add feature"}
        </button>
      </form>
    </div>
  );
}
