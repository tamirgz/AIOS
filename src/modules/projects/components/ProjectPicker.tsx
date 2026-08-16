"use client";

import { useTransition } from "react";
import { FolderKanban } from "lucide-react";
import { cn } from "@/core/ui/cn";
import type { ProjectOption } from "../queries";

/**
 * Compact "file this under a project or area" picker. Areas of development and
 * projects are grouped separately so the distinction is obvious. Value is the
 * entity ref ("projects:<uuid>") or null when unfiled.
 */
export function ProjectPicker({
  options,
  value,
  onChange,
  className,
}: {
  options: ProjectOption[];
  value: string | null;
  onChange: (ref: string | null) => void | Promise<void>;
  className?: string;
}) {
  const [pending, start] = useTransition();
  const currentId = value?.startsWith("projects:")
    ? value.slice("projects:".length)
    : "";
  const areas = options.filter((o) => o.kind === "area");
  const projects = options.filter((o) => o.kind === "project");

  return (
    <label
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-abyss/60 px-2 py-1 text-ink-dim transition focus-within:border-plasma/40",
        pending && "opacity-50",
        className,
      )}
      title="File this under a project or area of development"
    >
      <FolderKanban className="size-3 shrink-0 text-ink-faint" />
      <select
        value={currentId}
        disabled={pending}
        onChange={(e) => {
          const id = e.target.value;
          start(async () => {
            await onChange(id ? `projects:${id}` : null);
          });
        }}
        className="max-w-[220px] cursor-pointer bg-transparent pr-1 font-mono text-[10px] uppercase tracking-widest text-ink-dim outline-none [&_optgroup]:text-ink [&_option]:bg-abyss [&_option]:text-ink"
      >
        <option value="">— unfiled —</option>
        {areas.length > 0 && (
          <optgroup label="Areas of development">
            {areas.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </optgroup>
        )}
        {projects.length > 0 && (
          <optgroup label="Projects">
            {projects.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </label>
  );
}
