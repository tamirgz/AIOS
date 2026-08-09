"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Compass, OctagonAlert, RefreshCw } from "lucide-react";
import { cn } from "@/core/ui/cn";
import { runProjectAdvisor } from "../actions";

function ago(d: Date | string | null): string {
  if (!d) return "";
  const s = Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/** P1 Project Advisor — the chief-of-staff read, with an on-demand re-run. */
export function AdvisorPanel({
  state,
  blocker,
  next,
  updatedAt,
}: {
  state: string | null;
  blocker: string | null;
  next: string | null;
  updatedAt: Date | string | null;
}) {
  const router = useRouter();
  const [running, setRunning] = useState(false);

  const reRead = () => {
    setRunning(true);
    void runProjectAdvisor().finally(() => {
      // The agent runs in the worker; give it a beat, then pull the fresh read.
      setTimeout(() => {
        setRunning(false);
        router.refresh();
      }, 4000);
    });
  };

  return (
    <section className="glass rounded-2xl p-4">
      <div className="mb-3 flex items-center gap-2">
        <Compass className="size-4 text-ion" />
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-faint">
          advisor
        </p>
        {updatedAt && (
          <span className="font-mono text-[9px] uppercase tracking-widest text-ink-faint">
            · read {ago(updatedAt)} · haiku
          </span>
        )}
        <button
          type="button"
          onClick={reRead}
          disabled={running}
          title="Re-read all active projects (runs the Project-advisor agent)"
          className="ml-auto flex items-center gap-1.5 rounded-lg border border-ion/25 bg-ion/10 px-2.5 py-1 font-mono text-[9px] uppercase tracking-widest text-ion transition hover:bg-ion/20 disabled:opacity-50"
        >
          <RefreshCw className={cn("size-3", running && "animate-spin")} />
          {running ? "reading…" : "re-read"}
        </button>
      </div>

      {state ? (
        <div className="flex flex-col gap-2.5">
          <p dir="auto" className="text-sm leading-relaxed text-ink-dim">
            {state}
          </p>
          {blocker && (
            <p className="flex items-start gap-2 rounded-lg border border-flare/20 bg-flare/5 px-3 py-2 text-sm text-flare">
              <OctagonAlert className="mt-0.5 size-3.5 shrink-0" />
              <span>
                <span className="font-mono text-[9px] uppercase tracking-widest opacity-70">
                  blocker
                </span>
                <br />
                {blocker}
              </span>
            </p>
          )}
          {next && (
            <p className="flex items-start gap-2 text-sm text-ink-dim">
              <ArrowRight className="mt-0.5 size-3.5 shrink-0 text-plasma" />
              <span>
                <span className="font-mono text-[9px] uppercase tracking-widest text-plasma/70">
                  next move
                </span>
                <br />
                {next}
              </span>
            </p>
          )}
        </div>
      ) : (
        <p className="text-xs text-ink-faint">
          No advisor read yet — hit <span className="text-ion">re-read</span> to have
          the chief-of-staff assess this project (and the rest) from its tasks, notes
          and code.
        </p>
      )}
    </section>
  );
}
