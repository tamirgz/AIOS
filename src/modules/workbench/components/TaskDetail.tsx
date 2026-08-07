"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Archive,
  ArrowLeft,
  Check,
  FileDiff,
  RotateCcw,
  RotateCw,
  Square,
  Terminal,
  Trash2,
} from "lucide-react";
import { cn } from "@/core/ui/cn";
import { useLiveEvents } from "@/core/ui/useLiveEvents";
import {
  acceptTask,
  archiveTask,
  cancelTask,
  deleteTask,
  retryTask,
  unarchiveTask,
} from "../actions";
import type { TaskDetail as Detail } from "../queries";
import { STATUS_META } from "./TaskBoard";
import { ReportPanel } from "./ReportPanel";

const EVENT_COLOR: Record<string, string> = {
  status: "var(--color-ink-faint)",
  text: "var(--color-ink)",
  tool_call: "var(--color-ion)",
  tool_result: "var(--color-ink-faint)",
  summary: "var(--color-plasma)",
  result: "var(--color-plasma)",
  error: "var(--color-flare)",
  usage: "var(--color-ink-faint)",
};

function eventLine(e: Detail["events"][number]): string {
  const p = (e.payload ?? {}) as Record<string, unknown>;
  switch (e.type) {
    case "status":
      return `· ${p.phase}${p.branch ? ` ${p.branch}` : ""}${p.model ? ` (${p.model})` : ""}`;
    case "tool_call":
      return `→ ${p.name} ${typeof p.input === "string" ? p.input : JSON.stringify(p.input ?? "")}`.slice(
        0,
        400,
      );
    case "tool_result":
      return `← ${String(p.result ?? "").slice(0, 300)}`;
    case "summary":
      return `❯ ${p.text}`;
    case "result":
      return `✓ ${p.text ?? ""}`;
    case "error":
      return `✗ ${p.message}`;
    default:
      return String(p.text ?? JSON.stringify(p));
  }
}

/** Live tail — pinned to the bottom while running, like a real log. */
function EventTail({ events, live }: { events: Detail["events"]; live: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (live && ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [events.length, live]);

  return (
    <div
      ref={ref}
      className="max-h-[52vh] overflow-y-auto rounded-xl border border-white/6 bg-abyss/50 p-3 font-mono text-[11px] leading-relaxed"
    >
      {events.length === 0 && (
        <p className="text-ink-faint">waiting for the executor to speak…</p>
      )}
      {events.map((e) => (
        <p
          key={e.id}
          dir="auto"
          className="whitespace-pre-wrap break-words"
          style={{ color: EVENT_COLOR[e.type] ?? "var(--color-ink-dim)" }}
        >
          {eventLine(e)}
        </p>
      ))}
    </div>
  );
}

function DiffPane({ diff }: { diff: NonNullable<Detail["diff"]> }) {
  const [openFile, setOpenFile] = useState<string | null>(null);
  // Split the unified patch per file so a big change stays readable.
  const perFile = new Map<string, string>();
  for (const chunk of diff.patch.split(/^diff --git /m).filter(Boolean)) {
    const name = chunk.match(/b\/(\S+)/)?.[1];
    if (name) perFile.set(name, `diff --git ${chunk}`);
  }

  return (
    <div className="flex flex-col gap-2">
      {diff.files.map((f) => (
        <div key={f.path}>
          <button
            type="button"
            onClick={() => setOpenFile(openFile === f.path ? null : f.path)}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition hover:bg-white/4"
          >
            <FileDiff className="size-3.5 shrink-0 text-ion" />
            <span className="flex-1 truncate font-mono text-[11px] text-ink-dim">
              {f.path}
            </span>
            <span className="font-mono text-[10px] text-plasma">+{f.added}</span>
            <span className="font-mono text-[10px] text-flare">−{f.removed}</span>
          </button>
          {openFile === f.path && (
            <pre className="mt-1 max-h-80 overflow-auto rounded-lg border border-white/6 bg-void/60 p-3 font-mono text-[10px] leading-relaxed">
              {(perFile.get(f.path) ?? "").split("\n").map((line, i) => (
                <div
                  key={i}
                  className={cn(
                    line.startsWith("+") && !line.startsWith("+++") && "text-plasma",
                    line.startsWith("-") && !line.startsWith("---") && "text-flare",
                    line.startsWith("@@") && "text-ion",
                    !/^[+\-@]/.test(line) && "text-ink-faint",
                  )}
                >
                  {line || " "}
                </div>
              ))}
            </pre>
          )}
        </div>
      ))}
    </div>
  );
}

export function TaskDetailView({ detail }: { detail: Detail }) {
  const { task, attempts, events, diff } = detail;
  const [pending, start] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const router = useRouter();
  const live = task.status === "running" || task.status === "queued";
  useLiveEvents(["workbench_changed"]);

  const latest = attempts[attempts.length - 1];
  const meta = STATUS_META[task.status];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <Link
          href="/m/workbench"
          className="mt-1 rounded-lg p-1.5 text-ink-faint transition hover:bg-white/6 hover:text-ink"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div className="flex-1">
          <h2 className="font-display text-xl font-semibold text-ink">
            {task.title}
          </h2>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[9px] uppercase tracking-widest text-ink-faint">
            <span style={{ color: meta.color }}>{meta.label}</span>
            <span>{task.taskType}</span>
            {latest?.executorId && <span>{latest.executorId}</span>}
            {latest?.model && <span>{latest.model}</span>}
            {latest?.branch && <span className="text-ion/70">{latest.branch}</span>}
            {latest?.inputTokens != null && (
              <span>
                {latest.inputTokens.toLocaleString()} in ·{" "}
                {(latest.outputTokens ?? 0).toLocaleString()} out
              </span>
            )}
            {latest?.costUsd && <span>${Number(latest.costUsd).toFixed(2)}</span>}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {live && (
            <button
              type="button"
              disabled={pending}
              onClick={() => start(async () => void (await cancelTask(task.id)))}
              className="flex items-center gap-1.5 rounded-lg border border-white/8 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-ink-dim transition hover:border-flare/30 hover:text-flare disabled:opacity-40"
            >
              <Square className="size-3" />
              stop
            </button>
          )}
          {!live && (
            <button
              type="button"
              disabled={pending}
              onClick={() => start(async () => void (await retryTask(task.id)))}
              className="flex items-center gap-1.5 rounded-lg border border-white/8 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-ink-dim transition hover:border-ion/30 hover:text-ion disabled:opacity-40"
            >
              <RotateCw className="size-3" />
              retry
            </button>
          )}
          {task.status === "review" && (
            <button
              type="button"
              disabled={pending}
              onClick={() => start(async () => void (await acceptTask(task.id)))}
              className="flex items-center gap-1.5 rounded-lg bg-plasma/15 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-plasma transition hover:bg-plasma/25 disabled:opacity-40"
            >
              <Check className="size-3" />
              accept
            </button>
          )}
          {task.archivedAt ? (
            <>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    await unarchiveTask(task.id);
                  })
                }
                className="flex items-center gap-1.5 rounded-lg border border-white/8 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-ink-dim transition hover:border-ion/30 hover:text-ion disabled:opacity-40"
              >
                <RotateCcw className="size-3" />
                restore
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() =>
                  confirmDelete
                    ? start(async () => {
                        await deleteTask(task.id);
                        router.push("/m/workbench");
                      })
                    : setConfirmDelete(true)
                }
                className={cn(
                  "flex items-center gap-1.5 rounded-lg border px-3 py-2 font-mono text-[10px] uppercase tracking-widest transition disabled:opacity-40",
                  confirmDelete
                    ? "border-flare/40 bg-flare/15 text-flare hover:bg-flare/25"
                    : "border-white/8 text-ink-faint hover:border-flare/30 hover:text-flare",
                )}
              >
                <Trash2 className="size-3" />
                {confirmDelete ? "delete for good?" : "delete"}
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  await archiveTask(task.id);
                  // The card is hidden from the board now — don't strand the
                  // user on a page for something they can no longer find.
                  router.push("/m/workbench");
                })
              }
              title="Archive (removes the worktree, keeps the branch)"
              className="rounded-lg border border-white/8 p-2 text-ink-faint transition hover:text-ink disabled:opacity-40"
            >
              <Archive className="size-3" />
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <section className="glass rounded-2xl p-4 lg:col-span-2">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.3em] text-ink-faint">
            the ask
          </p>
          <p dir="auto" className="whitespace-pre-wrap text-sm leading-relaxed text-ink-dim">
            {task.prompt}
          </p>
          {task.repoPath && (
            <p className="mt-3 font-mono text-[10px] text-ink-faint">
              {task.repoPath}
            </p>
          )}
          {latest?.result && (
            <div className="mt-5">
              <ReportPanel
                attemptId={latest.id}
                taskId={task.id}
                result={latest.result}
                defaultTitle={
                  latest.result.match(/^#{1,6}\s+(.+)$/m)?.[1]?.trim() || task.title
                }
                sourceUrl={task.prompt.match(/https?:\/\/[^\s)]+/)?.[0] ?? ""}
              />
            </div>
          )}
          {latest?.error && (
            <p className="mt-4 rounded-lg border border-flare/20 bg-flare/5 p-3 text-xs text-flare">
              {latest.error}
            </p>
          )}
        </section>

        <section className="glass rounded-2xl p-4 lg:col-span-3">
          <div className="mb-2 flex items-center gap-2">
            <Terminal className="size-3.5 text-ink-faint" />
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-faint">
              live tail
            </p>
            {live && <span className="dot animate-pulse-soft text-plasma" />}
          </div>
          <EventTail events={events} live={live} />
        </section>
      </div>

      {diff && diff.files.length > 0 && (
        <section className="glass rounded-2xl p-4">
          <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.3em] text-ink-faint">
            diff · {diff.files.length} file(s) on {latest?.branch}
          </p>
          <DiffPane diff={diff} />
        </section>
      )}

      {attempts.length > 1 && (
        <section className="glass rounded-2xl p-4">
          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.3em] text-ink-faint">
            attempts
          </p>
          <div className="flex flex-col gap-1">
            {attempts.map((a) => (
              <div
                key={a.id}
                className="flex items-center gap-3 rounded-lg px-2 py-1.5 font-mono text-[10px] uppercase tracking-widest text-ink-faint"
              >
                <span className="w-6">#{a.seq}</span>
                <span className="flex-1 text-ink-dim">{a.executorId}</span>
                <span>{a.status}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
