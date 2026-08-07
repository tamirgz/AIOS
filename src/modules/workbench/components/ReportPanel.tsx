"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BookMarked, Check, Pencil, X } from "lucide-react";
import { cn } from "@/core/ui/cn";
import { Markdown } from "@/core/ui/Markdown";
import { clipTaskToObsidian, updateAttemptResult } from "../actions";

export function ReportPanel({
  attemptId,
  taskId,
  result,
  defaultTitle,
  sourceUrl,
}: {
  attemptId: string;
  taskId: string;
  result: string;
  defaultTitle: string;
  sourceUrl: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [text, setText] = useState(result);
  const [mode, setMode] = useState<"view" | "edit" | "clip">("view");
  const [draft, setDraft] = useState(result);
  const [title, setTitle] = useState(defaultTitle);
  const [source, setSource] = useState(sourceUrl);
  const [clip, setClip] = useState<{ ok?: string; err?: string }>({});

  const save = () =>
    start(async () => {
      await updateAttemptResult(attemptId, taskId, draft);
      setText(draft);
      setMode("view");
      router.refresh();
    });

  const doClip = () =>
    start(async () => {
      try {
        const { path } = await clipTaskToObsidian({
          title,
          source,
          body: text,
          createdISODate: new Date().toISOString().slice(0, 10),
        });
        setClip({ ok: path.split("/").slice(-2).join("/") });
        setMode("view");
      } catch (e) {
        setClip({ err: e instanceof Error ? e.message : String(e) });
      }
    });

  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-plasma">
          what came back
        </p>
        {mode === "view" && (
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => { setDraft(text); setMode("edit"); }}
              title="Edit the report"
              className="flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-ink-faint transition hover:bg-white/5 hover:text-ink-dim"
            >
              <Pencil className="size-3" /> edit
            </button>
            <button
              type="button"
              onClick={() => { setClip({}); setMode("clip"); }}
              title="Save into your Obsidian vault's raw/ folder"
              className="flex items-center gap-1 rounded-md border border-ion/25 bg-ion/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-widest text-ion transition hover:bg-ion/20"
            >
              <BookMarked className="size-3" /> obsidian
            </button>
          </div>
        )}
      </div>

      {mode === "edit" ? (
        <div className="flex flex-col gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={18}
            className="w-full resize-y rounded-lg border border-white/8 bg-abyss/50 p-3 font-mono text-xs leading-relaxed text-ink outline-none focus:border-plasma/30"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={save}
              className="flex items-center gap-1.5 rounded-lg bg-plasma/15 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-plasma transition hover:bg-plasma/25 disabled:opacity-40"
            >
              <Check className="size-3.5" /> save
            </button>
            <button
              type="button"
              onClick={() => setMode("view")}
              className="rounded-lg border border-white/8 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-ink-faint transition hover:text-ink-dim"
            >
              cancel
            </button>
          </div>
        </div>
      ) : mode === "clip" ? (
        <div className="glass flex flex-col gap-2 rounded-lg p-3">
          <p className="font-mono text-[9px] uppercase tracking-widest text-ink-faint">
            clip to obsidian → raw/
          </p>
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[9px] uppercase tracking-widest text-ink-faint">title</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-8 rounded-md bg-white/5 px-2 text-sm text-ink outline-none focus:bg-white/8"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-mono text-[9px] uppercase tracking-widest text-ink-faint">source url</span>
            <input
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="https://…"
              className="h-8 rounded-md bg-white/5 px-2 font-mono text-xs text-ink outline-none focus:bg-white/8"
            />
          </label>
          {clip.err && <p className="text-xs text-flare">{clip.err}</p>}
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={doClip}
              className="flex items-center gap-1.5 rounded-lg bg-ion/15 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-ion transition hover:bg-ion/25 disabled:opacity-40"
            >
              <BookMarked className="size-3.5" /> add to raw
            </button>
            <button
              type="button"
              onClick={() => setMode("view")}
              className="rounded-lg border border-white/8 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-ink-faint transition hover:text-ink-dim"
            >
              cancel
            </button>
          </div>
        </div>
      ) : (
        <div dir="auto" className={cn("max-w-none", pending && "opacity-60")}>
          <Markdown>{text}</Markdown>
        </div>
      )}

      {clip.ok && mode === "view" && (
        <p className="mt-2 flex items-center gap-1.5 rounded-lg border border-ion/20 bg-ion/5 px-3 py-2 text-xs text-ion">
          <Check className="size-3.5" /> clipped to <span className="font-mono">{clip.ok}</span> — your raw→wiki automation will take it from here.
        </p>
      )}
    </div>
  );
}
