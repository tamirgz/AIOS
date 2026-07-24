"use client";

import { useRef, useState, useTransition } from "react";
import { ExternalLink, FileText, Plus, Plug, RefreshCw, X } from "lucide-react";
import { cn } from "@/core/ui/cn";
import { addNotionWorkspace, removeNotionWorkspace, resyncNotion } from "../actions";

interface PageRow {
  id: string;
  title: string;
  url: string | null;
  workspace: string | null;
}

function AddWorkspaceForm({ compact }: { compact?: boolean }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(!compact);
  const ref = useRef<HTMLInputElement>(null);

  if (compact && !open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-lg border border-dashed border-white/12 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-ink-dim transition hover:bg-white/5"
      >
        <Plus className="size-3" />
        add workspace
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const v = ref.current?.value.trim();
        if (!v) return;
        setErr(null);
        start(async () => {
          const res = await addNotionWorkspace(v);
          if (res && "badToken" in res) setErr("That token was rejected by Notion.");
          else if (ref.current) ref.current.value = "";
          if (compact && !(res && "badToken" in res)) setOpen(false);
        });
      }}
      className="glass flex w-full items-center gap-2 rounded-xl p-1.5 pl-4"
    >
      <input
        ref={ref}
        type="password"
        placeholder="secret_… (Notion integration token)"
        className="h-9 flex-1 bg-transparent font-mono text-sm text-ink outline-none placeholder:text-ink-faint"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-plasma/15 px-4 py-2 font-mono text-[11px] uppercase tracking-widest text-plasma transition hover:bg-plasma/25 disabled:opacity-40"
      >
        {pending ? "connecting…" : "connect"}
      </button>
      {err && <span className="px-1 font-mono text-xs text-flare">{err}</span>}
    </form>
  );
}

export function NotionConsole({
  workspaces,
  counts,
  pages,
}: {
  workspaces: string[];
  counts: Record<string, number>;
  pages: PageRow[];
}) {
  const [pending, start] = useTransition();

  if (workspaces.length === 0) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center gap-4 rounded-2xl px-6 py-14 text-center">
        <Plug className="size-7 text-ink-dim" />
        <h2 className="font-display text-xl font-semibold text-ink">Connect Notion</h2>
        <p className="text-sm leading-relaxed text-ink-dim">
          For each workspace: create an internal integration at{" "}
          <span className="font-mono text-xs text-ink">notion.so/my-integrations</span>, share the
          pages/databases with it, then paste its token. AIOS indexes titles + text (read-only) so{" "}
          <span className="text-plasma">Ask</span> and search cover Notion. You can add multiple
          workspaces — one token each.
        </p>
        <div className="w-full">
          <AddWorkspaceForm />
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Connected workspaces */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {workspaces.map((w) => (
          <span
            key={w}
            className="glass flex items-center gap-2 rounded-lg py-1.5 pl-3 pr-1.5 text-sm"
          >
            <span className="font-medium text-ink">{w}</span>
            <span className="font-mono text-[10px] text-ink-faint">{counts[w] ?? 0}</span>
            <button
              type="button"
              title={`Disconnect ${w}`}
              onClick={() => start(async () => void (await removeNotionWorkspace(w)))}
              disabled={pending}
              className="rounded-md p-1 text-ink-faint transition hover:bg-flare/10 hover:text-flare disabled:opacity-40"
            >
              <X className="size-3.5" />
            </button>
          </span>
        ))}
        <AddWorkspaceForm compact />
        <button
          type="button"
          onClick={() => start(async () => void (await resyncNotion()))}
          disabled={pending}
          className="ml-auto flex items-center gap-1.5 rounded-lg border border-white/8 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-ink-dim transition hover:bg-white/5 disabled:opacity-40"
        >
          <RefreshCw className={cn("size-3", pending && "animate-spin")} />
          {pending ? "syncing…" : "resync"}
        </button>
      </div>

      <p className="mb-3 px-1 font-mono text-[11px] uppercase tracking-widest text-ink-faint">
        {pages.length} pages indexed · read-only
      </p>

      <div className="flex flex-col gap-1.5">
        {pages.map((p) => (
          <a
            key={p.id}
            href={p.url ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="glass group flex items-center gap-3 rounded-xl p-3 transition hover:bg-white/4"
          >
            <FileText className="size-4 shrink-0 text-ink-faint" />
            <span className="min-w-0 flex-1 truncate text-sm text-ink-dim transition group-hover:text-ink">
              {p.title}
            </span>
            {workspaces.length > 1 && p.workspace && (
              <span className="shrink-0 rounded-md border border-white/8 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-widest text-ink-faint">
                {p.workspace}
              </span>
            )}
            <ExternalLink className="size-3.5 shrink-0 text-ink-faint opacity-0 transition group-hover:opacity-100" />
          </a>
        ))}
        {pages.length === 0 && (
          <div className="rounded-xl border border-dashed border-white/6 py-12 text-center font-mono text-[10px] uppercase tracking-widest text-ink-faint">
            no pages yet — share pages with each integration, then resync
          </div>
        )}
      </div>
    </div>
  );
}
