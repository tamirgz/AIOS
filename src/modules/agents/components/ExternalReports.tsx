"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, MonitorDown } from "lucide-react";
import type { ExternalReport } from "../schema";
import { cn } from "@/core/ui/cn";
import { useLiveEvents } from "@/core/ui/useLiveEvents";

function ReportRow({ report }: { report: ExternalReport }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="glass rounded-xl p-3.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-3 text-left"
      >
        <MonitorDown className="size-3.5 shrink-0 text-ion" />
        <span className="flex-1 truncate text-sm text-ink">{report.title}</span>
        <span className="font-mono text-[9px] uppercase tracking-widest text-ink-faint">
          {report.kind === "claude-job" ? "claude desktop" : "drop-box"}
        </span>
        <span className="font-mono text-[9px] text-ink-faint">
          {new Date(report.reportedAt).toLocaleString(undefined, {
            month: "short",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
        <ChevronDown
          className={cn("size-3.5 text-ink-faint transition", open && "rotate-180")}
        />
      </button>
      {open && (
        <p className="mt-3 max-h-72 overflow-y-auto whitespace-pre-wrap border-t border-white/5 pt-3 text-xs leading-relaxed text-ink-dim">
          {report.body}
        </p>
      )}
    </div>
  );
}

export function ExternalReports({
  reports,
  dropboxDir,
}: {
  reports: ExternalReport[];
  dropboxDir: string;
}) {
  useLiveEvents(["external_reports"]);

  return (
    <div className="mt-8">
      <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.3em] text-ink-faint">
        external reports — agents running outside aios
      </p>
      <p className="mb-3 text-xs leading-relaxed text-ink-dim">
        Claude Desktop background jobs are picked up automatically. For Desktop{" "}
        <em>scheduled</em> agents, add to their prompt: &ldquo;write your final
        report as a .md file into{" "}
        <code className="font-mono text-[11px] text-ion">{dropboxDir}</code>
        &rdquo; — it lands here (and in the bell) within 5 minutes.
      </p>
      {reports.length === 0 ? (
        <div className="rounded-xl border border-dashed border-white/6 py-8 text-center font-mono text-[10px] uppercase tracking-widest text-ink-faint">
          no external reports yet
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <AnimatePresence mode="popLayout">
            {reports.map((r) => (
              <motion.div
                key={r.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <ReportRow report={r} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
