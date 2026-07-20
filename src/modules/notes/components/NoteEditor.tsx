"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import ReactMarkdown, { type Components } from "react-markdown";
import { ArrowLeft, Trash2 } from "lucide-react";
import { cn } from "@/core/ui/cn";
import { deleteNote, updateNote } from "../actions";
import type { Note } from "../schema";
import { ProjectPicker, type PickerProject } from "./ProjectPicker";

type SaveStatus = "saved" | "saving" | "unsaved";

const STATUS_STYLE: Record<SaveStatus, string> = {
  saved: "text-plasma",
  saving: "text-solar",
  unsaved: "text-ink-faint",
};

const mdComponents: Components = {
  h1: (props) => (
    <h1
      className="mt-6 mb-3 font-display text-2xl font-semibold text-ink first:mt-0"
      {...props}
    />
  ),
  h2: (props) => (
    <h2
      className="mt-5 mb-2.5 font-display text-xl font-semibold text-ink first:mt-0"
      {...props}
    />
  ),
  h3: (props) => (
    <h3
      className="mt-4 mb-2 font-display text-base font-medium text-ink first:mt-0"
      {...props}
    />
  ),
  p: (props) => (
    <p className="mb-3 text-sm leading-relaxed text-ink-dim" {...props} />
  ),
  a: (props) => (
    <a
      className="text-plasma underline decoration-plasma/40 underline-offset-2 transition hover:decoration-plasma"
      target="_blank"
      rel="noreferrer"
      {...props}
    />
  ),
  ul: (props) => (
    <ul
      className="mb-3 list-disc space-y-1 pl-5 text-sm leading-relaxed text-ink-dim"
      {...props}
    />
  ),
  ol: (props) => (
    <ol
      className="mb-3 list-decimal space-y-1 pl-5 text-sm leading-relaxed text-ink-dim"
      {...props}
    />
  ),
  code: (props) => (
    <code
      className="rounded bg-white/5 px-1 py-0.5 font-mono text-[12px] text-ion"
      {...props}
    />
  ),
  pre: (props) => (
    <pre
      className="mb-3 overflow-x-auto rounded-lg border border-white/6 bg-black/30 p-3 font-mono text-[12px] leading-relaxed [&_code]:bg-transparent [&_code]:p-0"
      {...props}
    />
  ),
  blockquote: (props) => (
    <blockquote
      className="mb-3 border-l-2 border-violet/40 pl-3 text-sm italic text-ink-dim"
      {...props}
    />
  ),
  hr: (props) => <hr className="my-4 border-white/8" {...props} />,
  strong: (props) => <strong className="font-semibold text-ink" {...props} />,
};

export function NoteEditor({
  note,
  projects = [],
}: {
  note: Note;
  projects?: PickerProject[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (armTimer.current) clearTimeout(armTimer.current);
    },
    [],
  );

  const queueSave = (nextTitle: string, nextBody: string) => {
    setStatus("unsaved");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setStatus("saving");
      await updateNote(note.id, {
        title: nextTitle.trim() || "Untitled note",
        body: nextBody,
      });
      setStatus("saved");
      setSavedAt(
        new Date().toLocaleTimeString("en-GB", { hour12: false }),
      );
    }, 800);
  };

  const onDelete = async () => {
    if (!armed) {
      setArmed(true);
      if (armTimer.current) clearTimeout(armTimer.current);
      armTimer.current = setTimeout(() => setArmed(false), 2500);
      return;
    }
    setDeleting(true);
    await deleteNote(note.id);
    router.push("/m/notes");
  };

  return (
    <div className="flex flex-col gap-4">
      <style>{`
        .cm-notes .cm-editor { background: transparent; outline: none; }
        .cm-notes .cm-gutters { background: transparent; border: none; }
        .cm-notes .cm-activeLine { background: transparent; }
        .cm-notes .cm-scroller { font-family: var(--font-mono); font-size: 13px; line-height: 1.7; }
      `}</style>

      <header className="flex items-center gap-3">
        <Link
          href="/m/notes"
          className="flex items-center gap-1.5 rounded-lg border border-white/8 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-widest text-ink-dim transition hover:bg-white/5 hover:text-ink"
        >
          <ArrowLeft className="size-3.5" />
          notes
        </Link>
        <ProjectPicker
          noteId={note.id}
          projects={projects}
          currentProjectId={note.projectRef?.split(":")[1] ?? null}
        />
        <span
          className={cn(
            "ml-auto font-mono text-[10px] uppercase tracking-widest",
            STATUS_STYLE[status],
          )}
        >
          {status === "saving"
            ? "saving…"
            : status === "unsaved"
              ? "unsaved"
              : savedAt
                ? `saved · ${savedAt}`
                : "saved"}
        </span>
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          title="Delete note"
          className={cn(
            "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-widest transition disabled:opacity-40",
            armed
              ? "border-flare/40 bg-flare/10 text-flare"
              : "border-white/8 text-ink-faint hover:bg-flare/10 hover:text-flare",
          )}
        >
          <Trash2 className="size-3.5" />
          {deleting ? "…" : armed ? "sure?" : "delete"}
        </button>
      </header>

      <input
        value={title}
        onChange={(e) => {
          setTitle(e.target.value);
          queueSave(e.target.value, body);
        }}
        placeholder="Untitled note"
        className="w-full bg-transparent font-display text-3xl font-semibold text-ink outline-none placeholder:text-ink-faint"
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="glass min-h-[24rem] rounded-xl p-3">
          <p className="mb-2 px-1 font-mono text-[9px] uppercase tracking-widest text-ink-faint">
            markdown
          </p>
          <CodeMirror
            value={body}
            theme="dark"
            extensions={[markdown()]}
            onChange={(value) => {
              setBody(value);
              queueSave(title, value);
            }}
            basicSetup={{
              lineNumbers: false,
              foldGutter: false,
              highlightActiveLine: false,
              highlightActiveLineGutter: false,
            }}
            placeholder="Write markdown…"
            className="cm-notes"
          />
        </section>
        <section className="glass min-h-[24rem] rounded-xl p-5">
          <p className="mb-3 font-mono text-[9px] uppercase tracking-widest text-ink-faint">
            preview
          </p>
          {body.trim() ? (
            <ReactMarkdown components={mdComponents}>{body}</ReactMarkdown>
          ) : (
            <p className="font-mono text-[10px] uppercase tracking-widest text-ink-faint">
              nothing to preview
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
