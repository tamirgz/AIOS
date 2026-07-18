"use client";

import Link from "next/link";
import { useRef, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { FolderPlus } from "lucide-react";
import { cn } from "@/core/ui/cn";
import { createProject } from "../actions";
import type { ProjectWithTaskCounts } from "../queries";
import { STATUS_CHIP } from "./statusStyle";

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

function ProjectCard({ project }: { project: ProjectWithTaskCounts }) {
  const { total, done } = project.taskCounts;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <motion.div
      layout
      layoutId={project.id}
      initial={{ opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ type: "spring", stiffness: 420, damping: 34 }}
    >
      <Link
        href={`/m/projects/${project.id}`}
        className="glass block rounded-xl p-4 transition hover:bg-white/4"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-display text-base font-medium text-ink">
            {project.name}
          </h2>
          <span
            className={cn(
              "shrink-0 rounded-md border px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest",
              STATUS_CHIP[project.status],
            )}
          >
            {project.status}
          </span>
        </div>
        {project.description && (
          <p className="mt-1.5 line-clamp-2 text-sm leading-snug text-ink-dim">
            {project.description}
          </p>
        )}
        <div className="mt-4">
          <div className="h-1.5 overflow-hidden rounded-full bg-white/6">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ type: "spring", stiffness: 120, damping: 24 }}
              className="h-full rounded-full bg-gradient-to-r from-plasma-dim to-plasma"
            />
          </div>
          <p className="mt-1.5 font-mono text-[10px] uppercase tracking-widest text-ink-faint">
            {done}/{total} tasks
          </p>
        </div>
      </Link>
    </motion.div>
  );
}

export function ProjectGrid({
  projects,
}: {
  projects: ProjectWithTaskCounts[];
}) {
  return (
    <div>
      <NewProjectForm />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <AnimatePresence mode="popLayout">
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </AnimatePresence>
      </div>
      {projects.length === 0 && (
        <div className="rounded-xl border border-dashed border-white/6 py-12 text-center font-mono text-[10px] uppercase tracking-widest text-ink-faint">
          no projects yet — start one above
        </div>
      )}
    </div>
  );
}
