"use client";

import { useRef, useTransition } from "react";
import { Plus } from "lucide-react";
import { createTask } from "../../tasks/actions";

export function ProjectTaskQuickAdd({ projectId }: { projectId: string }) {
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = () => {
    const title = inputRef.current?.value.trim();
    if (!title) return;
    startTransition(async () => {
      await createTask({ title, projectRef: `projects:${projectId}` });
      if (inputRef.current) inputRef.current.value = "";
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="glass flex items-center gap-2 rounded-xl p-2 pl-4 focus-within:glass-edge"
    >
      <Plus className="size-4 text-plasma" />
      <input
        ref={inputRef}
        placeholder="Add a task to this project… (Enter to commit)"
        className="h-9 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
        disabled={pending}
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-plasma/15 px-4 py-2 font-mono text-[11px] uppercase tracking-widest text-plasma transition hover:bg-plasma/25 disabled:opacity-40"
      >
        {pending ? "…" : "add"}
      </button>
    </form>
  );
}
