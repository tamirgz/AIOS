"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Check, ChevronDown, FolderKanban } from "lucide-react";
import { cn } from "@/core/ui/cn";
import type { ProjectOption } from "../queries";

/**
 * "File this under one or more projects/areas" picker. Multi-select: a button
 * that opens a grouped checklist (Areas of development vs Projects). Value is a
 * list of entity refs ("projects:<uuid>").
 */
export function ProjectMultiPicker({
  options,
  value,
  onChange,
  className,
}: {
  options: ProjectOption[];
  value: string[];
  onChange: (refs: string[]) => void | Promise<void>;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const boxRef = useRef<HTMLDivElement>(null);

  const selectedIds = new Set(
    value.map((v) => (v.startsWith("projects:") ? v.slice("projects:".length) : v)),
  );
  const areas = options.filter((o) => o.kind === "area");
  const projects = options.filter((o) => o.kind === "project");
  const selectedNames = options.filter((o) => selectedIds.has(o.id)).map((o) => o.name);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const toggle = (id: string) => {
    const ref = `projects:${id}`;
    const next = selectedIds.has(id) ? value.filter((v) => v !== ref) : [...value, ref];
    start(async () => {
      await onChange(next);
    });
  };

  const label =
    selectedNames.length === 0
      ? "file under…"
      : selectedNames.length === 1
        ? selectedNames[0]
        : `${selectedNames.length} filed`;

  const Group = ({ heading, items }: { heading: string; items: ProjectOption[] }) => (
    <div className="mb-1 last:mb-0">
      <p className="px-2 py-1 font-mono text-[9px] uppercase tracking-[0.2em] text-ink-faint">
        {heading}
      </p>
      {items.map((o) => {
        const on = selectedIds.has(o.id);
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => toggle(o.id)}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-ink-dim transition hover:bg-white/6"
          >
            <span
              className={cn(
                "flex size-4 shrink-0 items-center justify-center rounded border",
                on ? "border-plasma bg-plasma/25 text-plasma" : "border-white/15",
              )}
            >
              {on && <Check className="size-3" />}
            </span>
            <span className="truncate">{o.name}</span>
          </button>
        );
      })}
    </div>
  );

  return (
    <div ref={boxRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="File this under one or more projects / areas of development"
        className={cn(
          "flex max-w-[240px] items-center gap-1.5 rounded-lg border border-white/10 bg-abyss/60 px-2 py-1 font-mono text-[10px] uppercase tracking-widest transition hover:border-plasma/40",
          selectedNames.length ? "text-ink-dim" : "text-ink-faint",
          pending && "opacity-50",
        )}
      >
        <FolderKanban className="size-3 shrink-0 text-ink-faint" />
        <span className="truncate">{label}</span>
        <ChevronDown className="size-3 shrink-0 text-ink-faint" />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-1 max-h-80 w-64 overflow-auto rounded-lg border border-white/10 bg-abyss p-1 shadow-xl shadow-black/40">
          {areas.length > 0 && <Group heading="Areas of development" items={areas} />}
          {projects.length > 0 && <Group heading="Projects" items={projects} />}
          {options.length === 0 && (
            <p className="px-2 py-2 text-xs text-ink-faint">No projects yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
