"use client";

import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import type { MemoryBlock } from "@/core/db/schema/memory";
import { cn } from "@/core/ui/cn";
import { saveMemoryBlock } from "../actions";

function BlockField({ block }: { block: MemoryBlock }) {
  const [value, setValue] = useState(block.value);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = value !== block.value;

  return (
    <div className="glass rounded-xl p-3">
      <div className="mb-1 flex items-baseline justify-between">
        <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-plasma">
          {block.label}
        </p>
        <p
          className={cn(
            "font-mono text-[9px] tabular-nums",
            value.length > block.charLimit ? "text-flare" : "text-ink-faint",
          )}
        >
          {value.length}/{block.charLimit}
        </p>
      </div>
      <p className="mb-1.5 text-xs text-ink-dim">{block.description}</p>
      <textarea
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setSaved(false);
          setError(null);
        }}
        rows={2}
        placeholder="(empty — chat and agents will fill this as they learn, or write it yourself)"
        className="w-full resize-y rounded-lg border border-white/8 bg-abyss/50 p-3 text-sm leading-relaxed text-ink outline-none placeholder:text-ink-faint focus:border-plasma/30"
      />
      {error && <p className="mt-1 font-mono text-[10px] text-flare">{error}</p>}
      <button
        type="button"
        disabled={!dirty || pending}
        onClick={() =>
          startTransition(async () => {
            try {
              await saveMemoryBlock(block.label, value);
              setSaved(true);
            } catch (e) {
              setError(String(e).replace(/^Error:\s*/, ""));
            }
          })
        }
        className={cn(
          "mt-1 flex items-center gap-1.5 rounded-lg px-4 py-1.5 font-mono text-[10px] uppercase tracking-widest transition",
          dirty
            ? "bg-plasma/15 text-plasma hover:bg-plasma/25"
            : "border border-white/8 text-ink-faint",
        )}
      >
        {saved ? <Check className="size-3" /> : null}
        {pending ? "saving…" : saved ? "saved" : "save"}
      </button>
    </div>
  );
}

export function MemoryEditor({ blocks }: { blocks: MemoryBlock[] }) {
  return (
    <div className="flex flex-col gap-2.5">
      <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-faint">
        persistent memory — injected into every AI call
      </p>
      {blocks.map((b) => (
        <BlockField key={b.label} block={b} />
      ))}
    </div>
  );
}
