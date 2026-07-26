"use client";

import Link from "next/link";
import { useMemo, useRef, useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, ChevronDown, FolderPlus } from "lucide-react";
import { cn } from "@/core/ui/cn";
import { createProject } from "../actions";
import type { ProjectCockpit } from "../queries";
import { HealthChip } from "./HealthChip";
import { STATUS_CHIP } from "./statusStyle";

function lastActiveLabel(d: Date | null): string {
  if (!d) return "no activity";
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return "active today";
  if (days === 1) return "active yesterday";
  return `active ${days}d ago`;
}

function NewProjectForm() {
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = () => {
    const name = inputRef.current?.value.trim();
    if (!name) return;
    startTransition(async () => {
      await createProject({ name });
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
      <FolderPlus className="size-4 text-solar" />
      <input
        ref={inputRef}
        placeholder="Start a new project… (Enter to commit)"
        className="h-9 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
        disabled={pending}
        autoFocus
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-solar/15 px-4 py-2 font-mono text-[11px] uppercase tracking-widest text-solar transition hover:bg-solar/25 disabled:opacity-40"
      >
        {pending ? "…" : "create"}
      </button>
    </form>
  );
}

function ProjectCard({
  project,
  muted,
}: {
  project: ProjectCockpit;
  muted?: boolean;
}) {
  const { total, done, overdue } = project.taskCounts;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <motion.div
      layout
      layoutId={project.id}
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: muted ? 0.72 : 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ type: "spring", stiffness: 420, damping: 34 }}
    >
      <Link
        href={`/m/projects/${project.id}`}
        className="glass block rounded-xl p-4 transition hover:bg-white/4 hover:opacity-100"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-display text-base font-medium text-ink">
            {project.name}
          </h2>
          {project.status === "active" ? (
            <HealthChip
              health={project.resolvedHealth.health}
              reason={project.resolvedHealth.reason}
            />
          ) : (
            <span
              className={cn(
                "shrink-0 rounded-md border px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest",
                STATUS_CHIP[project.status],
              )}
            >
              {project.status}
            </span>
          )}
        </div>

        {project.nextAction ? (
          <p className="mt-2 flex items-start gap-1.5 text-sm leading-snug text-ink-dim">
            <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-solar" />
            <span className="line-clamp-2">{project.nextAction}</span>
          </p>
        ) : project.description ? (
          <p className="mt-1.5 line-clamp-2 text-sm leading-snug text-ink-dim">
            {project.description}
          </p>
        ) : null}

        <div className="mt-4">
          <div className="h-1.5 overflow-hidden rounded-full bg-white/6">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ type: "spring", stiffness: 120, damping: 24 }}
              className="h-full rounded-full bg-gradient-to-r from-plasma-dim to-plasma"
            />
          </div>
          <div className="mt-1.5 flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-ink-faint">
            <span>{lastActiveLabel(project.lastActivityAt)}</span>
            <span className="tabular-nums">
              {overdue > 0 && <span className="text-flare">{overdue} overdue · </span>}
              {done}/{total} tasks
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

function ProjectSection({
  title,
  projects,
  muted,
}: {
  title: string;
  projects: ProjectCockpit[];
  muted?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
      <AnimatePresence mode="popLayout">
        {projects.map((p) => (
          <ProjectCard key={p.id} project={p} muted={muted} />
        ))}
      </AnimatePresence>
    </div>
  );
}

/** Paused/done/archived aren't day-to-day — collapsed by default so they don't crowd out what's active. */
function InactiveProjects({ projects }: { projects: ProjectCockpit[] }) {
  const [open, setOpen] = useState(false);
  if (projects.length === 0) return null;

  return (
    <div className="mt-8">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="mb-3 flex w-full items-center gap-2 border-t border-white/6 pt-5 text-left"
      >
        <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-ink-faint">
          paused · done · archived
        </span>
        <span className="font-mono text-xs tabular-nums text-ink-faint">
          {projects.length}
        </span>
        <ChevronDown
          className={cn(
            "ml-auto size-3.5 text-ink-faint transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && <ProjectSection title="" projects={projects} muted />}
    </div>
  );
}

export function ProjectGrid({ projects }: { projects: ProjectCockpit[] }) {
  const { active, inactive } = useMemo(() => {
    const active: ProjectCockpit[] = [];
    const inactive: ProjectCockpit[] = [];
    for (const p of projects) (p.status === "active" ? active : inactive).push(p);
    return { active, inactive };
  }, [projects]);

  return (
    <div>
      <NewProjectForm />

      {active.length > 0 && (
        <div className="mb-3 flex items-center gap-2 px-1">
          <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-ink-faint">
            active
          </span>
          <span className="font-mono text-xs tabular-nums text-ink-faint">
            {active.length}
          </span>
        </div>
      )}
      <ProjectSection title="Active" projects={active} />

      {projects.length === 0 && (
        <div className="rounded-xl border border-dashed border-white/6 py-12 text-center font-mono text-[10px] uppercase tracking-widest text-ink-faint">
          no projects yet — start one above
        </div>
      )}
      {projects.length > 0 && active.length === 0 && (
        <div className="rounded-xl border border-dashed border-white/6 py-8 text-center font-mono text-[10px] uppercase tracking-widest text-ink-faint">
          no active projects — see paused/done/archived below
        </div>
      )}

      <InactiveProjects projects={inactive} />
    </div>
  );
}
