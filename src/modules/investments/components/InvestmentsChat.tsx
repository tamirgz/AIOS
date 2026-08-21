"use client";

import { useRef } from "react";
import { CornerDownLeft, Trash2 } from "lucide-react";
import { ChatMessages, useChat } from "@/core/ui/chat";

/**
 * Persistent investments chat — a continuous conversation that lives on the page
 * and survives reloads (localStorage), instead of the transient ⌘K bar. Hits the
 * same /api/chat backend, so it has the portfolio tools + viz.chart.
 */
export function InvestmentsChat() {
  const chat = useChat({ storageKey: "aios-investments-chat" });
  const inputRef = useRef<HTMLInputElement>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = inputRef.current?.value.trim();
    if (!v || chat.busy) return;
    chat.send(v);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div className="glass flex h-[calc(100vh-13rem)] min-h-[440px] flex-col rounded-2xl">
      <ChatMessages
        turns={chat.turns}
        className="px-5 py-4"
        emptyHint={
          <>
            Ask about your portfolio —<br />
            <span className="text-ink-faint">
              “summarize my holdings”, “chart my Algo P&amp;L by symbol”, “how am I
              doing this month?”
            </span>
          </>
        }
      />
      <form
        className="flex items-center gap-2 border-t border-white/6 px-4 py-3"
        onSubmit={submit}
      >
        <input
          ref={inputRef}
          autoFocus
          placeholder={chat.busy ? "thinking…" : "Ask about your investments…"}
          className="h-10 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-faint"
        />
        <button
          type="submit"
          disabled={chat.busy}
          className="rounded-lg bg-plasma/15 p-2 text-plasma transition hover:bg-plasma/25 disabled:opacity-40"
          title="Send"
        >
          <CornerDownLeft className="size-4" />
        </button>
        {chat.turns.length > 0 && (
          <button
            type="button"
            onClick={chat.reset}
            className="rounded-lg p-2 text-ink-faint transition hover:bg-white/6 hover:text-ink"
            title="Clear conversation"
          >
            <Trash2 className="size-4" />
          </button>
        )}
      </form>
      {chat.meta && (
        <p className="border-t border-white/4 px-4 py-1.5 font-mono text-[9px] uppercase tracking-widest text-ink-faint">
          via {chat.meta.provider} · {chat.meta.model}
        </p>
      )}
    </div>
  );
}
