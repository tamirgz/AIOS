"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { AnimatePresence, motion } from "motion/react";
import {
  CornerDownLeft,
  Inbox,
  LayoutGrid,
  Sparkles,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import { modules } from "@/modules/registry";
import { captureToInbox } from "@/modules/inbox/actions";
import { createTask } from "@/modules/tasks/actions";
import { createNote } from "@/modules/notes/actions";
import { cn } from "./cn";

/**
 * Deterministic fast path: recognized prefixes skip the LLM entirely and hit
 * CRUD server actions directly — sub-second, zero tokens.
 */
function parseFastPath(search: string) {
  const task = search.match(/^(?:task|todo|t):\s*(.+)$/i);
  if (task) return { kind: "task" as const, text: task[1].trim() };
  const note = search.match(/^(?:note|n):\s*(.+)$/i);
  if (note) return { kind: "note" as const, text: note[1].trim() };
  return null;
}

type ChatEvent =
  | { type: "meta"; provider: string; model: string }
  | { type: "text"; text: string }
  | { type: "tool_call"; name: string; input: unknown }
  | { type: "tool_result"; name: string; result: unknown }
  | { type: "usage"; inputTokens: number; outputTokens: number }
  | { type: "done"; text: string }
  | { type: "error"; message: string };

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
  toolCalls?: { name: string }[];
  pending?: boolean;
  error?: string;
}

function useChat() {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [busy, setBusy] = useState(false);
  const [meta, setMeta] = useState<{ provider: string; model: string } | null>(
    null,
  );

  const send = useCallback(
    async (text: string) => {
      // Cap resent history — long conversations otherwise grow token cost
      // linearly with every message.
      const history = turns
        .filter((t) => !t.pending && !t.error)
        .map((t) => ({ role: t.role, content: t.content }))
        .slice(-12);
      const nextMessages = [...history, { role: "user" as const, content: text }];
      setTurns((t) => [
        ...t,
        { role: "user", content: text },
        { role: "assistant", content: "", pending: true, toolCalls: [] },
      ]);
      setBusy(true);
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: nextMessages }),
        });
        if (!res.ok || !res.body) throw new Error(`chat → ${res.status}`);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const event = JSON.parse(line) as ChatEvent;
            setTurns((prev) => {
              const next = [...prev];
              const cur = { ...next[next.length - 1] };
              if (event.type === "text" || event.type === "done") {
                if (event.text) cur.content = event.text;
                if (event.type === "done") cur.pending = false;
              } else if (event.type === "tool_call") {
                cur.toolCalls = [...(cur.toolCalls ?? []), { name: event.name }];
              } else if (event.type === "error") {
                cur.error = event.message;
                cur.pending = false;
              }
              next[next.length - 1] = cur;
              return next;
            });
            if (event.type === "meta") setMeta(event);
          }
        }
      } catch (e) {
        setTurns((prev) => {
          const next = [...prev];
          const cur = { ...next[next.length - 1] };
          cur.error = String(e);
          cur.pending = false;
          next[next.length - 1] = cur;
          return next;
        });
      } finally {
        setBusy(false);
        setTurns((prev) =>
          prev.map((t, i) =>
            i === prev.length - 1 ? { ...t, pending: false } : t,
          ),
        );
      }
    },
    [turns],
  );

  return { turns, busy, meta, send, reset: () => setTurns([]) };
}

function ChatView({
  chat,
  onExit,
}: {
  chat: ReturnType<typeof useChat>;
  onExit: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [chat.turns]);

  return (
    <div className="flex h-[min(26.25rem,72vh)] flex-col">
      <div
        ref={scrollRef}
        className="flex-1 space-y-3 overflow-y-auto px-4 py-3"
      >
        {chat.turns.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <Sparkles className="size-5 text-plasma" />
            <p className="text-sm text-ink-dim">
              Ask anything, or tell me to do something —<br />
              <span className="text-ink-faint">
                “create a task to renew the domain”, “what’s in my pipeline?”
              </span>
            </p>
          </div>
        )}
        {chat.turns.map((t, i) => (
          <div key={i} className={cn("flex", t.role === "user" && "justify-end")}>
            <div
              className={cn(
                "max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm leading-relaxed",
                t.role === "user"
                  ? "bg-plasma/12 text-ink"
                  : "glass text-ink-dim",
              )}
            >
              {t.toolCalls?.map((c, j) => (
                <span
                  key={j}
                  className="mb-1.5 mr-1.5 inline-flex items-center gap-1.5 rounded-md border border-ion/25 bg-ion/8 px-2 py-0.5 font-mono text-[10px] text-ion"
                >
                  <Wrench className="size-3" />
                  {c.name}
                </span>
              ))}
              {t.content && (
                <p className="whitespace-pre-wrap">{t.content}</p>
              )}
              {t.pending && !t.content && (
                <span className="inline-flex gap-1">
                  {[0, 1, 2].map((d) => (
                    <span
                      key={d}
                      className="size-1.5 animate-pulse-soft rounded-full bg-plasma"
                      style={{ animationDelay: `${d * 0.25}s` }}
                    />
                  ))}
                </span>
              )}
              {t.error && (
                <p className="font-mono text-xs text-flare">{t.error}</p>
              )}
            </div>
          </div>
        ))}
      </div>
      <form
        className="flex items-center gap-2 border-t border-white/6 px-4 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          const v = inputRef.current?.value.trim();
          if (!v || chat.busy) return;
          chat.send(v);
          if (inputRef.current) inputRef.current.value = "";
        }}
      >
        <Sparkles className="size-4 shrink-0 text-plasma" />
        <input
          ref={inputRef}
          autoFocus
          placeholder={chat.busy ? "thinking…" : "Message the AI core…"}
          className="h-9 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-faint"
        />
        <button
          type="submit"
          disabled={chat.busy}
          className="rounded-lg bg-plasma/15 p-2 text-plasma transition hover:bg-plasma/25 disabled:opacity-40"
          title="Send"
        >
          <CornerDownLeft className="size-4" />
        </button>
        <button
          type="button"
          onClick={onExit}
          className="rounded-lg p-2 text-ink-faint transition hover:bg-white/6 hover:text-ink"
          title="Back to commands"
        >
          <X className="size-4" />
        </button>
      </form>
      {chat.meta && (
        <p className="border-t border-white/4 px-4 py-1.5 font-mono text-[9px] uppercase tracking-widest text-ink-faint">
          via {chat.meta.provider} · {chat.meta.model}
        </p>
      )}
    </div>
  );
}

export function CommandBar() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"commands" | "chat">("commands");
  const [search, setSearch] = useState("");
  const router = useRouter();
  const chat = useChat();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("aios:commandbar", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("aios:commandbar", onOpen);
    };
  }, []);

  useEffect(() => {
    if (!open) {
      setMode("commands");
      setSearch("");
    }
  }, [open]);

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const fast = parseFastPath(search);
  const runFast = async () => {
    if (!fast) return;
    if (fast.kind === "task") await createTask({ title: fast.text });
    else await createNote({ title: fast.text });
    setOpen(false);
    router.refresh();
  };
  const runCapture = async () => {
    if (!search.trim()) return;
    await captureToInbox(search.trim());
    setOpen(false);
    router.refresh();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-start justify-center bg-void/60 pt-[12vh] backdrop-blur-sm"
          onClick={() => setOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 480, damping: 38 }}
            className="glass glass-edge w-full max-w-xl overflow-hidden rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {mode === "chat" ? (
              <ChatView chat={chat} onExit={() => setMode("commands")} />
            ) : (
              <Command label="Command bar" shouldFilter>
                <div className="flex items-center gap-2 border-b border-white/6 px-4">
                  <LayoutGrid className="size-4 text-ink-faint" />
                  <Command.Input
                    value={search}
                    onValueChange={setSearch}
                    autoFocus
                    placeholder="Type a command, or ask the AI…"
                    className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-faint"
                  />
                  <kbd className="rounded-md border border-white/10 px-1.5 py-0.5 font-mono text-[10px] text-ink-faint">
                    esc
                  </kbd>
                </div>
                <Command.List className="max-h-80 overflow-y-auto p-2">
                  <Command.Empty className="px-3 py-6 text-center font-mono text-[11px] uppercase tracking-widest text-ink-faint">
                    no matching commands — try asking the AI
                  </Command.Empty>

                  {fast && (
                    <Command.Item
                      value={`fast ${search}`}
                      forceMount
                      onSelect={runFast}
                      className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-ink transition data-[selected=true]:bg-solar/10"
                    >
                      <Zap className="size-4 text-solar" />
                      <span>
                        {fast.kind === "task" ? "New task" : "New note"}{" "}
                        <span className="text-ink-dim">“{fast.text}”</span>
                      </span>
                      <span className="ml-auto font-mono text-[9px] uppercase tracking-widest text-solar">
                        instant
                      </span>
                    </Command.Item>
                  )}

                  {search.trim() && !fast && (
                    <Command.Item
                      value={`capture ${search}`}
                      forceMount
                      onSelect={runCapture}
                      className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-ink transition data-[selected=true]:bg-solar/10"
                    >
                      <Inbox className="size-4 text-solar" />
                      <span>
                        Capture to Inbox{" "}
                        <span className="text-ink-dim">
                          “{search.trim().slice(0, 40)}
                          {search.trim().length > 40 ? "…" : ""}”
                        </span>
                      </span>
                      <span className="ml-auto font-mono text-[9px] uppercase tracking-widest text-ink-faint">
                        ai files it
                      </span>
                    </Command.Item>
                  )}

                  <Command.Item
                    value={`ask-ai ${search}`}
                    forceMount
                    onSelect={() => {
                      setMode("chat");
                      if (search.trim()) chat.send(search.trim());
                    }}
                    className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-ink transition data-[selected=true]:bg-plasma/10"
                  >
                    <Sparkles className="size-4 text-plasma" />
                    <span>
                      Ask AI{" "}
                      {search.trim() && (
                        <span className="text-ink-dim">“{search.trim()}”</span>
                      )}
                    </span>
                    <span className="ml-auto font-mono text-[9px] uppercase tracking-widest text-ink-faint">
                      chat
                    </span>
                  </Command.Item>

                  <Command.Group
                    heading="Navigate"
                    className="mt-1 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:font-mono [&_[cmdk-group-heading]]:text-[9px] [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.25em] [&_[cmdk-group-heading]]:text-ink-faint"
                  >
                    <Command.Item
                      value="dashboard home deck"
                      onSelect={() => go("/")}
                      className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-ink-dim transition data-[selected=true]:bg-white/6 data-[selected=true]:text-ink"
                    >
                      <LayoutGrid className="size-4" />
                      Dashboard
                    </Command.Item>
                    {modules.flatMap((m) =>
                      m.commands.map((c) => {
                        const Icon = m.icon;
                        return (
                          <Command.Item
                            key={c.id}
                            value={`${c.title} ${c.keywords.join(" ")}`}
                            onSelect={() => go(c.href)}
                            className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-ink-dim transition data-[selected=true]:bg-white/6 data-[selected=true]:text-ink"
                          >
                            <Icon
                              className="size-4"
                              style={{ color: m.accent }}
                            />
                            {c.title}
                            <span className="ml-auto font-mono text-[9px] uppercase tracking-widest text-ink-faint">
                              {m.id}
                            </span>
                          </Command.Item>
                        );
                      }),
                    )}
                  </Command.Group>
                </Command.List>
              </Command>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
