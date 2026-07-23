"use client";

import { useState, useTransition } from "react";
import { ArrowRight, Check, Pencil, Target, X } from "lucide-react";
import { cn } from "@/core/ui/cn";
import { HealthChip } from "./HealthChip";
import type { ProjectHealth } from "../schema";

/** One inline-editable line (goal / next action). Enter or ✓ saves; Esc cancels. */
function EditableLine({
  value,
  placeholder,
  icon,
  accent,
  onSave,
}: {
  value: string | null;
  placeholder: string;
  icon: React.ReactNode;
  accent: string;
  onSave: (v: string | null) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [pending, startTransition] = useTransition();

  const commit = () => {
    const next = draft.trim();
    setEditing(false);
    if (next === (value ?? "")) return;
    startTransition(() => onSave(next || null));
  };

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <span className="shrink-0" style={{ color: accent }}>
          {icon}
        </span>
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setDraft(value ?? "");
              setEditing(false);
            }
          }}
          onBlur={commit}
          placeholder={placeholder}
          className="h-8 flex-1 rounded-lg bg-white/5 px-3 text-sm text-ink outline-none placeholder:text-ink-faint focus:bg-white/8"
        />
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={commit}
          className="rounded-md p-1.5 text-plasma transition hover:bg-plasma/10"
          title="Save"
        >
          <Check className="size-3.5" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setDraft(value ?? "");
            setEditing(false);
          }}
          className="rounded-md p-1.5 text-ink-faint transition hover:bg-white/6 hover:text-ink"
          title="Cancel"
        >
          <X className="size-3.5" />
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(value ?? "");
        setEditing(true);
      }}
      className={cn(
        "group/line flex w-full items-start gap-2 rounded-lg px-1.5 py-1 text-left transition hover:bg-white/4",
        pending && "opacity-50",
      )}
    >
      <span className="mt-0.5 shrink-0" style={{ color: accent }}>
        {icon}
      </span>
      <span
        className={cn(
          "flex-1 text-sm leading-snug",
          value ? "text-ink-dim" : "text-ink-faint italic",
        )}
      >
        {value ?? placeholder}
      </span>
      <Pencil className="mt-0.5 size-3 shrink-0 text-ink-faint opacity-0 transition group-hover/line:opacity-100" />
    </button>
  );
}

export function CockpitHeader({
  id,
  status,
  goal,
  nextAction,
  health,
  healthReason,
  healthSource,
  stats,
  lastActive,
  setGoal,
  setNextAction,
}: {
  id: string;
  status: "active" | "paused" | "done";
  goal: string | null;
  nextAction: string | null;
  health: ProjectHealth;
  healthReason: string;
  healthSource: "agent" | "derived";
  stats: { open: number; done: number; overdue: number; notes: number; attention: number };
  lastActive: string;
  setGoal: (id: string, goal: string | null) => Promise<void>;
  setNextAction: (id: string, nextAction: string | null) => Promise<void>;
}) {
  return (
    <div className="glass rounded-2xl p-4">
      <div className="mb-3 flex items-center gap-2.5">
        {status === "active" && (
          <HealthChip health={health} reason={healthReason} />
        )}
        <span className="text-sm text-ink-dim">{healthReason}</span>
        <span
          className="ml-auto font-mono text-[9px] uppercase tracking-widest text-ink-faint"
          title={
            healthSource === "agent"
              ? "set by the Project-pulse agent"
              : "derived from activity (no agent run yet)"
          }
        >
          {healthSource === "agent" ? "pulse" : "auto"}
        </span>
      </div>

      <div className="flex flex-col gap-1 border-t border-white/6 pt-3">
        <EditableLine
          value={goal}
          placeholder="Set the goal — what outcome is this project for?"
          icon={<Target className="size-3.5" />}
          accent="var(--color-plasma)"
          onSave={(v) => setGoal(id, v)}
        />
        <EditableLine
          value={nextAction}
          placeholder="Set the next action — one concrete step"
          icon={<ArrowRight className="size-3.5" />}
          accent="var(--color-solar)"
          onSave={(v) => setNextAction(id, v)}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-white/6 pt-3 font-mono text-[10px] uppercase tracking-widest text-ink-faint">
        <span>{lastActive}</span>
        <span className="tabular-nums">{stats.open} open</span>
        <span className="tabular-nums">{stats.done} done</span>
        {stats.overdue > 0 && (
          <span className="tabular-nums text-flare">{stats.overdue} overdue</span>
        )}
        {stats.notes > 0 && <span className="tabular-nums">{stats.notes} notes</span>}
        {stats.attention > 0 && (
          <span className="tabular-nums text-solar">{stats.attention} needs you</span>
        )}
      </div>
    </div>
  );
}
