"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { FolderKanban, X } from "lucide-react";
import { cn } from "@/core/ui/cn";
import { setNoteProject } from "../actions";

export interface PickerProject {
  id: string;
  name: string;
}

/** Chip + dropdown for assigning a note to a project (or clearing it). */
export function ProjectPicker({
  noteId,
  projects,
  currentProjectId,
}: {
  noteId: string;
  projects: PickerProject[];
  currentProjectId: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(currentProjectId);
  const [pending, startTransition] = useTransition();
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const current = projects.find((p) => p.id === selected) ?? null;

  const assign = (projectId: string | null) => {
    setSelected(projectId);
    setOpen(false);
    startTransition(async () => {
      await setNoteProject(noteId, projectId);
    });
  };

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={current ? `Project: ${current.name}` : "Assign to a project"}
        className={cn(
          "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-widest transition",
          current
            ? "border-solar/30 text-solar hover:bg-solar/10"
            : "border-white/8 text-ink-faint hover:text-ink-dim",
          pending && "opacity-50",
        )}
      >
        <FolderKanban className="size-3" />
        <span className="max-w-40 truncate normal-case tracking-normal">
          {current ? current.name : "no project"}
        </span>
      </button>

      {open && (
        <div className="glass glass-edge absolute left-0 top-9 z-30 max-h-64 w-60 overflow-y-auto rounded-xl p-1.5">
          {projects.length === 0 && (
            <p className="px-2 py-3 text-center font-mono text-[10px] uppercase tracking-widest text-ink-faint">
              no projects yet
            </p>
          )}
          {projects.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => assign(p.id)}
              className={cn(
                "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm transition hover:bg-white/6",
                p.id === selected ? "text-solar" : "text-ink-dim",
              )}
            >
              <FolderKanban className="size-3.5 shrink-0" />
              <span className="truncate">{p.name}</span>
            </button>
          ))}
          {selected && (
            <button
              type="button"
              onClick={() => assign(null)}
              className="mt-1 flex w-full items-center gap-2 border-t border-white/6 px-2.5 pt-2 pb-1.5 text-left font-mono text-[10px] uppercase tracking-widest text-ink-faint transition hover:text-flare"
            >
              <X className="size-3" /> remove from project
            </button>
          )}
        </div>
      )}
    </div>
  );
}
