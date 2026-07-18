"use client";

import { useRef, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Inbox, RefreshCw, Trash2, Zap } from "lucide-react";
import { cn } from "@/core/ui/cn";
import { useLiveEvents } from "@/core/ui/useLiveEvents";
import { captureToInbox, deleteInboxItem, retryTriage } from "../actions";
import type { InboxItem, InboxStatus } from "../schema";

const STATUS_META: Record<
  InboxStatus,
  { label: string; color: string; pulse: boolean }
> = {
  new: { label: "queued", color: "var(--color-ink-faint)", pulse: true },
  triaging: { label: "routing…", color: "var(--color-solar)", pulse: true },
  triaged: { label: "routed", color: "var(--color-plasma)", pulse: false },
  error: { label: "error", color: "var(--color-flare)", pulse: false },
};

function CaptureBox() {
  const [pending, startTransition] = useTransition();
  const ref = useRef<HTMLTextAreaElement>(null);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const v = ref.current?.value.trim();
        if (!v || pending) return;
        startTransition(async () => {
          await captureToInbox(v);
          if (ref.current) ref.current.value = "";
        });
      }}
      className="glass mb-6 flex items-start gap-3 rounded-2xl p-4 focus-within:glass-edge"
    >
      <Inbox className="mt-1 size-5 shrink-0 text-solar" />
      <textarea
        ref={ref}
        rows={2}
        autoFocus
        placeholder="Dump anything — a to-do, an idea, a link, 'call dan tuesday 3pm'… AI files it for you."
        className="min-h-14 flex-1 resize-y bg-transparent text-sm leading-relaxed text-ink outline-none placeholder:text-ink-faint"
        disabled={pending}
      />
      <button
        type="submit"
        disabled={pending}
        className="flex items-center gap-2 rounded-lg bg-solar/15 px-4 py-2 font-mono text-[11px] uppercase tracking-widest text-solar transition hover:bg-solar/25 disabled:opacity-40"
      >
        <Zap className="size-3.5" />
        {pending ? "…" : "capture"}
      </button>
    </form>
  );
}

export function InboxList({ items }: { items: InboxItem[] }) {
  const [, startTransition] = useTransition();
  useLiveEvents(["inbox_changed"]);

  return (
    <div className="max-w-3xl">
      <CaptureBox />
      {items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/6 py-14 text-center font-mono text-[10px] uppercase tracking-widest text-ink-faint">
          inbox zero — nice
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          <AnimatePresence mode="popLayout">
            {items.map((item) => {
              const status = STATUS_META[item.status];
              return (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ type: "spring", stiffness: 400, damping: 34 }}
                  className="group glass rounded-xl p-4"
                >
                  <div className="flex items-start gap-3">
                    <span
                      className={cn(
                        "mt-1.5 dot shrink-0",
                        status.pulse && "animate-pulse-soft",
                      )}
                      style={{ color: status.color }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm leading-snug text-ink">
                        {item.input.length > 160
                          ? item.input.slice(0, 160) + "…"
                          : item.input}
                      </p>
                      {item.triage?.summary && (
                        <p className="mt-1 text-xs text-plasma/80">
                          → {item.triage.summary}
                        </p>
                      )}
                      {item.error && (
                        <p className="mt-1 font-mono text-[10px] text-flare">
                          {item.error}
                        </p>
                      )}
                    </div>
                    <span
                      className="shrink-0 font-mono text-[9px] uppercase tracking-widest"
                      style={{ color: status.color }}
                    >
                      {status.label}
                    </span>
                  </div>
                  <div className="mt-2 flex justify-end gap-1 opacity-0 transition group-hover:opacity-100">
                    {item.status === "error" && (
                      <button
                        type="button"
                        title="Retry triage"
                        onClick={() =>
                          startTransition(async () => {
                            await retryTriage(item.id);
                          })
                        }
                        className="rounded-md p-1.5 text-ink-faint transition hover:text-solar"
                      >
                        <RefreshCw className="size-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      title="Delete"
                      onClick={() =>
                        startTransition(async () => {
                          await deleteInboxItem(item.id);
                        })
                      }
                      className="rounded-md p-1.5 text-ink-faint transition hover:text-flare"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
