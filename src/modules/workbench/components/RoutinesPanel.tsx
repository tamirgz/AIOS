"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  Repeat,
  Play,
  Plus,
  Trash2,
  GitPullRequest,
  ChevronDown,
  Check,
} from "lucide-react";
import { useLiveEvents } from "@/core/ui/useLiveEvents";
import {
  createRoutine,
  deleteRoutine,
  runRoutineNow,
  setRoutineEnabled,
  updateRoutine,
} from "../actions";
import type { Routine } from "../queries";

interface ProjectOpt {
  id: string;
  name: string;
}
interface ExecutorOpt {
  id: string;
  name: string;
}

/** A row + an expandable panel exposing every property of the routine. */
function RoutineRow({
  r,
  executors,
}: {
  r: Routine;
  executors: ExecutorOpt[];
}) {
  const [pending, start] = useTransition();
  const [openDetail, setOpenDetail] = useState(false);
  const on = r.enabled === "true";

  // editable fields
  const [name, setName] = useState(r.name);
  const [prompt, setPrompt] = useState(r.prompt);
  const [executorId, setExecutorId] = useState(r.executorId);
  const [model, setModel] = useState(r.model ?? "");
  const [trigger, setTrigger] = useState(r.triggerKind);
  const [schedule, setSchedule] = useState(r.schedule ?? "");
  const [deliverPr, setDeliverPr] = useState(r.deliverPr === "true");

  const dirty =
    name !== r.name ||
    prompt !== r.prompt ||
    executorId !== r.executorId ||
    model !== (r.model ?? "") ||
    trigger !== r.triggerKind ||
    schedule !== (r.schedule ?? "") ||
    deliverPr !== (r.deliverPr === "true");

  const triggerLabel =
    r.triggerKind === "commit"
      ? "on commit"
      : r.triggerKind === "schedule"
        ? `cron ${r.schedule}`
        : `commit + ${r.schedule}`;

  const fmt = (d: Date | null) =>
    d ? new Date(d).toLocaleString() : "never";

  return (
    <div className="rounded-xl border border-white/6 bg-void/30">
      <div className="flex items-center gap-3 p-3">
        <button
          type="button"
          title={on ? "Enabled — click to pause" : "Paused — click to enable"}
          disabled={pending}
          onClick={() => start(async () => void (await setRoutineEnabled(r.id, !on)))}
          className={`size-2.5 shrink-0 rounded-full transition ${on ? "bg-plasma shadow-[0_0_8px_var(--color-plasma)]" : "bg-ink-faint/40"}`}
        />
        <button
          type="button"
          onClick={() => setOpenDetail((v) => !v)}
          className="min-w-0 flex-1 text-left"
        >
          <p className="truncate text-sm text-ink">{r.name}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 font-mono text-[9px] uppercase tracking-widest text-ink-faint">
            <span className="text-ion/70">{triggerLabel}</span>
            <span>{r.executorId}</span>
            {r.deliverPr === "true" && (
              <span className="flex items-center gap-0.5 text-plasma/70">
                <GitPullRequest className="size-2.5" /> PR
              </span>
            )}
            {r.prUrl && (
              <a
                href={r.prUrl}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-0.5 text-plasma underline hover:text-plasma/80"
              >
                open PR
              </a>
            )}
          </div>
        </button>
        <ChevronDown
          className={`size-3.5 shrink-0 text-ink-faint transition ${openDetail ? "rotate-180" : ""}`}
        />
        <button
          type="button"
          title="Run now"
          disabled={pending}
          onClick={() => start(async () => void (await runRoutineNow(r.id)))}
          className="rounded-md p-1.5 text-ink-faint transition hover:text-ion"
        >
          <Play className="size-3.5" />
        </button>
        <button
          type="button"
          title="Delete routine"
          disabled={pending}
          onClick={() => start(async () => void (await deleteRoutine(r.id)))}
          className="rounded-md p-1.5 text-ink-faint transition hover:text-flare"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>

      {openDetail && (
        <div className="flex flex-col gap-3 border-t border-white/6 p-3">
          <label className="font-mono text-[9px] uppercase tracking-widest text-ink-faint">
            title
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Routine title"
            className="rounded-lg border border-white/8 bg-void/50 px-3 py-2 text-sm text-ink outline-none focus:border-ion/40"
          />
          <label className="mt-1 font-mono text-[9px] uppercase tracking-widest text-ink-faint">
            the ask
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={5}
            className="resize-y rounded-lg border border-white/8 bg-void/50 px-3 py-2 text-sm leading-relaxed text-ink outline-none focus:border-ion/40"
          />
          <div className="flex flex-wrap gap-2">
            <select
              value={executorId}
              onChange={(e) => setExecutorId(e.target.value)}
              className="rounded-lg border border-white/8 bg-void/50 px-3 py-2 text-sm text-ink-dim outline-none"
            >
              {executors.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="model (blank = executor default)"
              className="w-56 rounded-lg border border-white/8 bg-void/50 px-3 py-2 font-mono text-xs text-ink-dim outline-none focus:border-ion/40"
            />
            <select
              value={trigger}
              onChange={(e) => setTrigger(e.target.value as typeof trigger)}
              className="rounded-lg border border-white/8 bg-void/50 px-3 py-2 text-sm text-ink-dim outline-none"
            >
              <option value="commit">on each commit</option>
              <option value="schedule">on a schedule</option>
              <option value="both">commit + schedule</option>
            </select>
            {trigger !== "commit" && (
              <input
                value={schedule}
                onChange={(e) => setSchedule(e.target.value)}
                placeholder="cron"
                className="w-40 rounded-lg border border-white/8 bg-void/50 px-3 py-2 font-mono text-xs text-ink-dim outline-none focus:border-ion/40"
              />
            )}
            <label className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-ink-dim">
              <input
                type="checkbox"
                checked={deliverPr}
                onChange={(e) => setDeliverPr(e.target.checked)}
              />
              deliver PR
            </label>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[10px] text-ink-faint sm:grid-cols-3">
            <span>repo: <span className="text-ink-dim">{r.repoPath?.split("/").pop() ?? "—"}</span></span>
            <span>last commit seen: <span className="text-ink-dim">{r.lastSeenSha?.slice(0, 8) ?? "—"}</span></span>
            <span>last fired: <span className="text-ink-dim">{fmt(r.lastFiredAt)}</span></span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!dirty || pending}
              onClick={() =>
                start(async () => {
                  await updateRoutine(r.id, {
                    name,
                    prompt,
                    executorId,
                    model: model.trim() || null,
                    triggerKind: trigger,
                    schedule: trigger === "commit" ? null : schedule,
                    deliverPr,
                  });
                })
              }
              className="flex items-center gap-1.5 rounded-lg bg-ion/15 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-ion transition hover:bg-ion/25 disabled:opacity-40"
            >
              <Check className="size-3" />
              save
            </button>
            {r.lastTaskId && (
              <Link
                href={`/m/workbench/${r.lastTaskId}`}
                className="font-mono text-[10px] uppercase tracking-widest text-ink-faint underline hover:text-ink"
              >
                last run →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Routines (A1) — the recurring delegations. Each fires on a new commit and/or
 * a schedule, runs through the judge, and delivers as an approval-gated PR.
 */
export function RoutinesPanel({
  routines,
  projects,
  executors,
}: {
  routines: Routine[];
  projects: ProjectOpt[];
  executors: ExecutorOpt[];
}) {
  useLiveEvents(["routines_changed"]);
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  // create-form state
  const [name, setName] = useState("");
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [prompt, setPrompt] = useState("");
  const [executorId, setExecutorId] = useState("opencode");
  const [trigger, setTrigger] = useState<"commit" | "schedule" | "both">("commit");
  const [schedule, setSchedule] = useState("0 8 * * 1-5");

  const canSave = name.trim() && projectId && prompt.trim().length > 10;

  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center gap-2">
        <Repeat className="size-4 text-ion" />
        <h3 className="font-mono text-[11px] uppercase tracking-[0.3em] text-ink-faint">
          routines
        </h3>
        <span className="font-mono text-[10px] text-ink-faint">{routines.length}</span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="ml-auto flex items-center gap-1.5 rounded-lg border border-ion/25 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-ion transition hover:bg-ion/10"
        >
          <Plus className="size-3" />
          new routine
        </button>
      </div>

      {open && (
        <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-ion/20 bg-void/40 p-4">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Routine name — e.g. NoClick doc-sync"
            className="rounded-lg border border-white/8 bg-void/50 px-3 py-2 text-sm text-ink outline-none focus:border-ion/40"
          />
          <div className="flex flex-wrap gap-2">
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="rounded-lg border border-white/8 bg-void/50 px-3 py-2 text-sm text-ink-dim outline-none"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <select
              value={executorId}
              onChange={(e) => setExecutorId(e.target.value)}
              className="rounded-lg border border-white/8 bg-void/50 px-3 py-2 text-sm text-ink-dim outline-none"
            >
              {executors.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.name}
                </option>
              ))}
            </select>
            <select
              value={trigger}
              onChange={(e) => setTrigger(e.target.value as typeof trigger)}
              className="rounded-lg border border-white/8 bg-void/50 px-3 py-2 text-sm text-ink-dim outline-none"
            >
              <option value="commit">on each commit</option>
              <option value="schedule">on a schedule</option>
              <option value="both">commit + schedule</option>
            </select>
            {trigger !== "commit" && (
              <input
                value={schedule}
                onChange={(e) => setSchedule(e.target.value)}
                placeholder="cron e.g. 0 8 * * 1-5"
                className="w-40 rounded-lg border border-white/8 bg-void/50 px-3 py-2 font-mono text-xs text-ink-dim outline-none focus:border-ion/40"
              />
            )}
          </div>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            placeholder="The standing ask, run on every trigger. e.g. Analyze the latest commit and keep docs/Capability-Matrix.html and docs/OnePager.html in sync…"
            className="resize-y rounded-lg border border-white/8 bg-void/50 px-3 py-2 text-sm leading-relaxed text-ink outline-none focus:border-ion/40"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!canSave || pending}
              onClick={() =>
                start(async () => {
                  await createRoutine({
                    name,
                    projectId,
                    prompt,
                    executorId,
                    triggerKind: trigger,
                    schedule: trigger === "commit" ? null : schedule,
                  });
                  setName("");
                  setPrompt("");
                  setOpen(false);
                })
              }
              className="rounded-lg bg-ion/15 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-ion transition hover:bg-ion/25 disabled:opacity-40"
            >
              create routine
            </button>
            <span className="font-mono text-[9px] text-ink-faint">
              delivered as an approval-gated PR — never a direct write
            </span>
          </div>
        </div>
      )}

      {routines.length === 0 && !open ? (
        <p className="rounded-xl border border-white/6 bg-void/30 p-4 text-xs text-ink-faint">
          No routines yet. A routine runs your ask on every new commit (or a
          schedule), verifies the result, and opens a PR for you to approve.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {routines.map((r) => (
            <RoutineRow key={r.id} r={r} executors={executors} />
          ))}
        </div>
      )}
    </section>
  );
}
