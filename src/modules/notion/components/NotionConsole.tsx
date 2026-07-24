"use client";

import { useRef, useState, useTransition } from "react";
import { ExternalLink, FileText, Plug, RefreshCw } from "lucide-react";
import { cn } from "@/core/ui/cn";
import { disconnectNotion, resyncNotion, setNotionToken } from "../actions";

interface PageRow {
  id: string;
  title: string;
  url: string | null;
  lastEdited: Date | null;
}

export function NotionConsole({
  connected,
  pages,
}: {
  connected: boolean;
  pages: PageRow[];
}) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const tokenRef = useRef<HTMLInputElement>(null);

  if (!connected) {
    return (
      <div className="mx-auto flex max-w-xl flex-col items-center gap-4 rounded-2xl px-6 py-14 text-center">
        <Plug className="size-7 text-ink-dim" />
        <h2 className="font-display text-xl font-semibold text-ink">Connect Notion</h2>
        <p className="text-sm leading-relaxed text-ink-dim">
          Create an internal integration at{" "}
          <span className="font-mono text-xs text-ink">notion.so/my-integrations</span>, share the
          pages/databases you want indexed with it, then paste its token below. AIOS indexes titles
          + text (read-only) so <span className="text-plasma">Ask</span> and search cover Notion too.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const v = tokenRef.current?.value.trim();
            if (!v) return;
            setErr(null);
            start(async () => {
              const res = await setNotionToken(v);
              if (res && "badToken" in res) setErr("That token was rejected by Notion.");
            });
          }}
          className="glass flex w-full items-center gap-2 rounded-xl p-1.5 pl-4"
        >
          <input
            ref={tokenRef}
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
        </form>
        {err && <p className="font-mono text-xs text-flare">{err}</p>}
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5 flex items-center gap-3">
        <p className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-ink-faint">
          <FileText className="size-3.5 text-plasma" />
          {pages.length} pages indexed · read-only
        </p>
        <button
          type="button"
          onClick={() => start(async () => void (await resyncNotion()))}
          disabled={pending}
          className="ml-auto flex items-center gap-1.5 rounded-lg border border-white/8 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-ink-dim transition hover:bg-white/5 disabled:opacity-40"
        >
          <RefreshCw className={cn("size-3", pending && "animate-spin")} />
          {pending ? "syncing…" : "resync"}
        </button>
        <button
          type="button"
          onClick={() => start(async () => void (await disconnectNotion()))}
          disabled={pending}
          className="rounded-lg border border-white/8 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-ink-faint transition hover:bg-flare/10 hover:text-flare disabled:opacity-40"
        >
          disconnect
        </button>
      </div>

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
            <ExternalLink className="size-3.5 shrink-0 text-ink-faint opacity-0 transition group-hover:opacity-100" />
          </a>
        ))}
        {pages.length === 0 && (
          <div className="rounded-xl border border-dashed border-white/6 py-12 text-center font-mono text-[10px] uppercase tracking-widest text-ink-faint">
            no pages yet — share pages with the integration, then resync
          </div>
        )}
      </div>
    </div>
  );
}
