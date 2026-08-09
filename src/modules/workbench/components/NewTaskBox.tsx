"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Code2, Cpu, FileText, Sparkles, Wrench } from "lucide-react";
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
    id: "code-local",
    label: "code · local",
    icon: Cpu,
    hint: "Local agent + local model on its own branch — free, private, slower",
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
export function NewTaskBox({
  defaultRepo,
  executors,
  freeModels,
  projectRepos = [],
}: {
  defaultRepo: string;
  executors: { id: string; name: string; defaultModel: string | null }[];
  /** Free models each executor may use (local + its free cloud tiers). */
  freeModels: Record<string, string[]>;
  /** Projects with an attached, cloned repo — pickable for a code task. */
  projectRepos?: { name: string; path: string }[];
}) {
  const [type, setType] = useState<TaskType>("research");
  const [repo, setRepo] = useState(defaultRepo);
  const [executorId, setExecutorId] = useState("");
  const [model, setModel] = useState("");
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
        executorId: executorId || undefined,
        model: model.trim() || undefined,
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
          <>
            <input
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
              spellCheck={false}
              list="wb-project-repos"
              placeholder="/absolute/path/to/repo — or pick a project"
              className="w-72 rounded-lg border border-white/8 bg-abyss/60 px-3 py-1.5 font-mono text-[11px] text-ink-dim outline-none focus:border-plasma/40"
            />
            {/* Attached project repos (feature #9) — agent reads that code. */}
            <datalist id="wb-project-repos">
              {projectRepos.map((r) => (
                <option key={r.path} value={r.path}>
                  {r.name}
                </option>
              ))}
            </datalist>
          </>
        )}
        <span className="font-mono text-[9px] uppercase tracking-widest text-ink-faint">
          ⌘↵ to send
        </span>
      </div>

      {/* The override exists for "this one is delicate, use Claude" and the
          reverse — the type still decides when it's left on auto. */}
      <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-white/6 pt-2.5">
        <span className="font-mono text-[9px] uppercase tracking-widest text-ink-faint">
          executor
        </span>
        <select
          value={executorId}
          onChange={(e) => {
            setExecutorId(e.target.value);
            const ex = executors.find((x) => x.id === e.target.value);
            setModel(ex?.defaultModel ?? "");
          }}
          className="rounded-lg border border-white/8 bg-abyss/60 px-2 py-1 font-mono text-[10px] text-ink-dim outline-none focus:border-plasma/40 [color-scheme:dark]"
        >
          <option value="">auto (by type)</option>
          {executors.map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </select>
        {executorId && (
          <>
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              spellCheck={false}
              list="wb-free-models"
              placeholder="model"
              className="w-72 rounded-lg border border-white/8 bg-abyss/60 px-2 py-1 font-mono text-[10px] text-ink-dim outline-none focus:border-plasma/40"
            />
            {/* Only this executor's free models — local + its free cloud tiers. */}
            <datalist id="wb-free-models">
              {(freeModels[executorId] ?? []).map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
            {(freeModels[executorId]?.length ?? 0) > 0 && (
              <span className="font-mono text-[9px] uppercase tracking-widest text-plasma/70">
                {freeModels[executorId].length} free models
              </span>
            )}
          </>
        )}
      </div>
    </section>
  );
}
