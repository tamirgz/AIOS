"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Layers, Plus, Trash2, Unlink } from "lucide-react";
import { cn } from "@/core/ui/cn";
import { setTaskStatus, deleteTask } from "@/modules/tasks/actions";
import type { Task, TaskStatus } from "@/modules/tasks/schema";
import type { Feature } from "../schema";
import {
  createFeature,
  createFeatureTask,
  deleteFeature,
  setTaskFeature,
} from "../features-actions";

export interface FeatureGroup {
  feature: Feature;
  tasks: Task[];
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

/** planned → building → done, derived from the feature's tasks. */
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

function FeatureCard({ projectId, feature, tasks }: { projectId: string } & FeatureGroup) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const done = tasks.filter((t) => t.status === "done").length;
  const total = tasks.length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const status = deriveStatus(tasks);

  const addTask = () => {
    const title = inputRef.current?.value.trim();
    if (!title) return;
    start(async () => {
      await createFeatureTask(feature.id, projectId, title);
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    });
  };

  return (
    <div className="glass rounded-xl p-4">
      <div className="mb-2 flex items-center gap-2.5">
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
          title="Delete feature (its tasks become loose)"
          onClick={() => start(async () => { await deleteFeature(feature.id, projectId); router.refresh(); })}
          className="shrink-0 rounded p-1 text-ink-faint transition hover:bg-flare/10 hover:text-flare"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>

      <div className="mb-2 h-1 overflow-hidden rounded-full bg-white/6">
        <div className="h-full rounded-full bg-gradient-to-r from-plasma-dim to-plasma" style={{ width: `${pct}%` }} />
      </div>

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
    </div>
  );
}

export function ProjectFeatures({
  projectId,
  groups,
}: {
  projectId: string;
  groups: FeatureGroup[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

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

      {groups.map((g) => (
        <FeatureCard key={g.feature.id} projectId={projectId} feature={g.feature} tasks={g.tasks} />
      ))}

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
