"use client";

import { useState, useTransition } from "react";
import { Send, Plus, RefreshCw, Trash2, Check, X } from "lucide-react";
import { useLiveEvents } from "@/core/ui/useLiveEvents";
import { addChannel, deleteChannel, ingestNow, setChannelEnabled } from "../actions";
import type { TelegramChannel, TelegramPost } from "../schema";

export function TelegramView({
  channels,
  activeUsername,
  posts,
}: {
  channels: TelegramChannel[];
  activeUsername: string | null;
  posts: TelegramPost[];
}) {
  useLiveEvents(["telegram_changed"]);
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(channels.length === 0);
  const [username, setUsername] = useState("");
  const [criteria, setCriteria] = useState("");
  const [days, setDays] = useState("14");

  const relevant = posts.filter((p) => p.relevant === "yes");

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center gap-3">
        <Send className="size-5 text-ion" />
        <h1 className="font-display text-2xl font-semibold text-ink">Telegram sources</h1>
        <span className="font-mono text-[10px] uppercase tracking-widest text-ink-faint">
          public channels · read-only · relevance-gated
        </span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="ml-auto flex items-center gap-1.5 rounded-lg border border-ion/25 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-ion transition hover:bg-ion/10"
        >
          <Plus className="size-3" /> add channel
        </button>
      </header>

      {open && (
        <div className="flex flex-col gap-2 rounded-2xl border border-ion/20 bg-void/40 p-4">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="channel — @RedXCyberSecurity or https://t.me/s/RedXCyberSecurity"
            className="rounded-lg border border-white/8 bg-void/50 px-3 py-2 text-sm text-ink outline-none focus:border-ion/40"
          />
          <textarea
            value={criteria}
            onChange={(e) => setCriteria(e.target.value)}
            rows={2}
            placeholder="What counts as relevant? e.g. Malicious links/URLs, phishing, smishing, QR-code attacks, malicious PDF/office/archive files, CDR — NoClick's domain."
            className="resize-y rounded-lg border border-white/8 bg-void/50 px-3 py-2 text-sm leading-relaxed text-ink outline-none focus:border-ion/40"
          />
          <div className="flex items-center gap-2">
            <label className="font-mono text-[10px] uppercase tracking-widest text-ink-faint">
              backfill
            </label>
            <input
              value={days}
              onChange={(e) => setDays(e.target.value)}
              className="w-16 rounded-lg border border-white/8 bg-void/50 px-2 py-1.5 font-mono text-xs text-ink-dim outline-none"
            />
            <span className="font-mono text-[10px] text-ink-faint">days</span>
            <button
              type="button"
              disabled={pending || !username.trim() || criteria.trim().length < 10}
              onClick={() =>
                start(async () => {
                  await addChannel({ username, criteria, backfillDays: Number(days) || 14 });
                  setUsername("");
                  setOpen(false);
                })
              }
              className="ml-auto rounded-lg bg-ion/15 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-ion transition hover:bg-ion/25 disabled:opacity-40"
            >
              add & backfill
            </button>
          </div>
        </div>
      )}

      {channels.length > 0 && (
        <div className="flex flex-col gap-2">
          {channels.map((c) => {
            const on = c.enabled === "true";
            return (
              <div key={c.id} className="flex items-center gap-3 rounded-xl border border-white/6 bg-void/30 p-3">
                <button
                  type="button"
                  onClick={() => start(async () => void (await setChannelEnabled(c.id, !on)))}
                  className={`size-2.5 shrink-0 rounded-full ${on ? "bg-plasma shadow-[0_0_8px_var(--color-plasma)]" : "bg-ink-faint/40"}`}
                  title={on ? "enabled" : "paused"}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink">@{c.username}</p>
                  <p className="truncate font-mono text-[9px] uppercase tracking-widest text-ink-faint">
                    cursor {c.lastSeenId ?? "—"} · {c.lastRunAt ? new Date(c.lastRunAt).toLocaleString() : "never run"}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => start(async () => void (await ingestNow(c.id)))}
                  title="Ingest now"
                  className="rounded-md p-1.5 text-ink-faint transition hover:text-ion"
                >
                  <RefreshCw className="size-3.5" />
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => start(async () => void (await deleteChannel(c.id)))}
                  className="rounded-md p-1.5 text-ink-faint transition hover:text-flare"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {activeUsername && (
        <section>
          <div className="mb-2 flex items-center gap-2 px-1">
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-ink-faint">
              @{activeUsername} · {relevant.length} relevant of {posts.length}
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            {posts.map((p) => {
              const yes = p.relevant === "yes";
              return (
                <div
                  key={p.id}
                  className={`rounded-xl border p-3 ${yes ? "border-plasma/25 bg-plasma/[0.04]" : "border-white/6 bg-void/20"}`}
                >
                  <div className="mb-1 flex items-center gap-2 font-mono text-[9px] uppercase tracking-widest">
                    {yes ? (
                      <span className="flex items-center gap-0.5 text-plasma"><Check className="size-2.5" /> relevant</span>
                    ) : (
                      <span className="flex items-center gap-0.5 text-ink-faint"><X className="size-2.5" /> skip</span>
                    )}
                    {p.relevanceWhy && <span className="text-ink-faint normal-case tracking-normal">· {p.relevanceWhy}</span>}
                    <span className="ml-auto text-ink-faint">
                      {p.postedAt ? new Date(p.postedAt).toLocaleString() : `#${p.postId}`}
                    </span>
                  </div>
                  <p dir="auto" className="line-clamp-3 text-sm leading-relaxed text-ink-dim">
                    {p.text}
                  </p>
                  {p.urls.length > 0 && (
                    <a
                      href={p.urls[0]}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-block truncate font-mono text-[10px] text-ion/70 underline hover:text-ion"
                    >
                      {p.urls[0]}
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
