"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, MonitorDown } from "lucide-react";
import type { ExternalReport } from "../schema";
import { cn } from "@/core/ui/cn";
import { Markdown } from "@/core/ui/Markdown";
import { useLiveEvents } from "@/core/ui/useLiveEvents";

function ReportRow({ report }: { report: ExternalReport }) {
  const [open, setOpen] = useState(false);
  const origin =
    report.origin ??
    (report.kind === "claude-job" ? "claude desktop" : "drop-box");
  const preview = report.body
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[*_~`#>-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return (
    <div
      className={cn(
        "glass overflow-hidden rounded-xl transition",
        open && "glass-edge",
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-start gap-3 p-3.5 text-left transition hover:bg-white/3"
      >
        <MonitorDown className="mt-0.5 size-4 shrink-0 text-ion" />
        <span className="min-w-0 flex-1">
          <span
            dir="auto"
            className="block truncate text-left text-sm font-medium text-ink"
          >
            {report.title}
          </span>
          {!open && preview && (
            <span className="mt-0.5 block truncate text-left text-xs text-ink-faint">
              {preview.slice(0, 120)}
            </span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-2.5">
          <span className="rounded-md border border-ion/20 bg-ion/5 px-1.5 py-0.5 font-mono text-[9px] text-ion">
            {origin}
          </span>
          <span className="font-mono text-[9px] tabular-nums text-ink-faint">
            {new Date(report.reportedAt).toLocaleString(undefined, {
              month: "short",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            })}
          </span>
          <ChevronDown
            className={cn(
              "size-3.5 text-ink-faint transition",
              open && "rotate-180",
            )}
          />
        </span>
      </button>

      {open && (
        <div
          dir="auto"
          className="max-h-[28rem] overflow-y-auto border-t border-white/6 px-4 py-3.5 text-left"
        >
          <Markdown>{report.body}</Markdown>
        </div>
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
        external reports — agents running outside apOS
      </p>
      <p className="mb-3 text-xs leading-relaxed text-ink-dim">
        Claude Desktop routines that post to Slack are ingested automatically —
        configure the bot token + channels in Settings. Local jobs and any tool
        that writes a .md file into{" "}
        <code className="font-mono text-[11px] text-ion">{dropboxDir}</code>{" "}
        are picked up too, within 5 minutes.
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
