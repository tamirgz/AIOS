"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Code2, FileText, Sparkles, Wrench } from "lucide-react";
import { cn } from "@/core/ui/cn";
import { createTask } from "../actions";
import type { TaskType } from "../schema";

const TYPES: {
  id: TaskType;
  label: string;
  icon: typeof Code2;
  hint: string;
  needsRepo?: boolean;
}[] = [
  {
    id: "research",
    label: "research",
    icon: BookOpen,
    hint: "Claude with web search — findings come back as a report",
  },
  {
    id: "code",
    label: "code",
    icon: Code2,
    hint: "Claude Code on its own branch — review the diff when it lands",
    needsRepo: true,
  },
  {
    id: "docs",
    label: "docs",
    icon: FileText,
    hint: "Runs locally against your AIOS data with the module tools",
  },
  {
    id: "custom",
    label: "custom",
    icon: Wrench,
    hint: "Claude Code, no repo — anything that doesn't fit the others",
  },
];

/**
 * One box. The type picker is the only decision, and it silently resolves
 * executor, model and permissions — the point of the Workbench is that
 * delegating shouldn't require configuring an agent first.
 */
export function NewTaskBox({ defaultRepo }: { defaultRepo: string }) {
  const [type, setType] = useState<TaskType>("research");
  const [repo, setRepo] = useState(defaultRepo);
  const [pending, start] = useTransition();
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const router = useRouter();
  const active = TYPES.find((t) => t.id === type)!;

  const submit = () => {
    const prompt = promptRef.current?.value.trim();
    if (!prompt || pending) return;
    start(async () => {
      const task = await createTask({
        prompt,
        taskType: type,
        repoPath: active.needsRepo ? repo : null,
      });
      if (promptRef.current) promptRef.current.value = "";
      router.push(`/m/workbench/${task.id}`);
    });
  };

  return (
    <section className="glass mb-5 rounded-2xl p-4 focus-within:glass-edge">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="size-4 text-plasma" />
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-faint">
          delegate a task
        </p>
      </div>

      <textarea
        ref={promptRef}
        rows={3}
        placeholder="Research the current state of local coding agents…  ·  Fix the stale badge count in the inbox widget…"
        disabled={pending}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
        }}
        className="w-full resize-none bg-transparent text-sm leading-relaxed text-ink outline-none placeholder:text-ink-faint"
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {TYPES.map((t) => {
          const Icon = t.icon;
          const on = t.id === type;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setType(t.id)}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-widest transition",
                on
                  ? "border-plasma/40 bg-plasma/15 text-plasma"
                  : "border-white/8 text-ink-faint hover:border-white/16 hover:text-ink-dim",
              )}
            >
              <Icon className="size-3" />
              {t.label}
            </button>
          );
        })}

        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="ml-auto rounded-lg bg-plasma/15 px-4 py-2 font-mono text-[11px] uppercase tracking-widest text-plasma transition hover:bg-plasma/25 disabled:opacity-40"
        >
          {pending ? "starting…" : "delegate"}
        </button>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <p className="flex-1 text-xs text-ink-faint">{active.hint}</p>
        {active.needsRepo && (
          <input
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
            spellCheck={false}
            placeholder="/absolute/path/to/repo"
            className="w-72 rounded-lg border border-white/8 bg-abyss/60 px-3 py-1.5 font-mono text-[11px] text-ink-dim outline-none focus:border-plasma/40"
          />
        )}
        <span className="font-mono text-[9px] uppercase tracking-widest text-ink-faint">
          ⌘↵ to send
        </span>
      </div>
    </section>
  );
}
