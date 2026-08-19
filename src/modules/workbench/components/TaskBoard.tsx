"use client";

import Link from "next/link";
import { motion } from "motion/react";
import {
  BookOpen,
  Code2,
  Cpu,
  FileText,
  GitBranch,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { useLiveEvents } from "@/core/ui/useLiveEvents";
import { cn } from "@/core/ui/cn";
import type { TaskWithAttempt } from "../queries";
import type { TaskStatus, TaskType } from "../schema";

const TYPE_ICON: Record<TaskType, LucideIcon> = {
  research: BookOpen,
  code: Code2,
  "code-local": Cpu,
  docs: FileText,
  custom: Wrench,
};

export const STATUS_META: Record<
  TaskStatus,
  { label: string; color: string; pulse?: boolean }
> = {
  queued: { label: "queued", color: "var(--color-ink-faint)" },
  running: { label: "running", color: "var(--color-plasma)", pulse: true },
  needs_input: { label: "needs you", color: "var(--color-solar)", pulse: true },
  review: { label: "review", color: "var(--color-ion)" },
  done: { label: "done", color: "var(--color-plasma-dim)" },
  failed: { label: "failed", color: "var(--color-flare)" },
  cancelled: { label: "cancelled", color: "var(--color-ink-faint)" },
};

/** Groups, in the order attention should flow. */
const GROUPS: { key: string; title: string; statuses: TaskStatus[] }[] = [
  { key: "live", title: "in flight", statuses: ["running", "queued", "needs_input"] },
  { key: "review", title: "waiting on you", statuses: ["review", "failed"] },
  { key: "closed", title: "settled", statuses: ["done", "cancelled"] },
];

function age(from: Date | string | null | undefined) {
  if (!from) return null;
  const ms = Date.now() - new Date(from).getTime();
  if (ms < 60_000) return `${Math.max(1, Math.round(ms / 1000))}s`;
  if (ms < 3600_000) return `${Math.round(ms / 60_000)}m`;
  return `${Math.round(ms / 3600_000)}h`;
}

function TaskCard({ task }: { task: TaskWithAttempt }) {
  const Icon = TYPE_ICON[task.taskType];
  const meta = STATUS_META[task.status];
  const a = task.latest;
  // Heartbeat age is the honest liveness signal: a spinner proves nothing.
  const beat = task.status === "running" ? age(a?.heartbeatAt) : null;

  return (
    <motion.div layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
      <Link
        href={`/m/workbench/${task.id}`}
        className="glass block rounded-xl p-4 transition hover:glass-edge"
      >
        <div className="flex items-start gap-3">
          <Icon className="mt-0.5 size-4 shrink-0 text-ink-faint" />
          <p className="flex-1 text-sm leading-snug text-ink">{task.title}</p>
          <span
            className={cn(
              "shrink-0 font-mono text-[9px] uppercase tracking-widest",
              meta.pulse && "animate-pulse-soft",
            )}
            style={{ color: meta.color }}
          >
            {meta.label}
          </span>
        </div>

        {task.summary && task.status !== "running" && (
          <p className="mt-2 line-clamp-2 pl-7 text-xs leading-relaxed text-ink-dim">
            {task.summary}
          </p>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 pl-7 font-mono text-[9px] uppercase tracking-widest text-ink-faint">
          <span>{task.taskType}</span>
          {a?.executorId && <span>{a.executorId}</span>}
          {a?.model && <span>{a.model}</span>}
          {task.attemptCount > 1 && <span>attempt {task.attemptCount}</span>}
          {a?.branch && (
            <span className="flex items-center gap-1 text-ion/70">
              <GitBranch className="size-2.5" />
              {a.branch.replace("aios/", "")}
            </span>
          )}
          {beat && <span className="text-plasma">beat {beat} ago</span>}
          {a?.costUsd && <span>${Number(a.costUsd).toFixed(2)}</span>}
        </div>
      </Link>
    </motion.div>
  );
}

export function TaskBoard({ tasks }: { tasks: TaskWithAttempt[] }) {
  useLiveEvents(["workbench_changed"]);

  if (tasks.length === 0) {
    return (
      <div className="glass rounded-2xl p-10 text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-faint">
          nothing delegated yet
        </p>
        <p className="mx-auto mt-3 max-w-md text-sm text-ink-dim">
          Describe a job in the box above and apOS runs it unattended — research
          comes back as a report, code comes back as a branch you review here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {GROUPS.map((g) => {
        const items = tasks.filter((t) => g.statuses.includes(t.status));
        if (items.length === 0) return null;
        return (
          <section key={g.key}>
            <p className="mb-2.5 px-1 font-mono text-[10px] uppercase tracking-[0.3em] text-ink-faint">
              {g.title} · {items.length}
            </p>
            <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
              {items.map((t) => (
                <TaskCard key={t.id} task={t} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
