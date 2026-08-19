"use client";

import { useState, useTransition } from "react";
import { reconnectClaude, verifyClaudeAuth } from "../actions";

/**
 * Live-verify the Claude Max connection (catches an EXPIRED token, which mere
 * presence can't) and reconnect: run `claude setup-token` in a terminal, paste
 * the token here, and it's written to .env.local + the worker restarts.
 */
export function ClaudeReconnect() {
  const [verify, setVerify] = useState<null | { valid: boolean; error?: string }>(null);
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState("");
  const [msg, setMsg] = useState("");
  const [pending, start] = useTransition();

  const expired =
    verify && !verify.valid && /expired|refresh|auth/i.test(verify.error ?? "");

  return (
    <div className="mt-4 border-t border-white/6 pt-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => start(async () => { setMsg(""); setVerify(await verifyClaudeAuth()); })}
          className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-ink-dim transition hover:border-plasma/40 hover:text-plasma disabled:opacity-50"
        >
          {pending ? "Checking…" : "Verify connection"}
        </button>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-ink-dim transition hover:border-plasma/40 hover:text-plasma"
        >
          Reconnect
        </button>
        {verify &&
          (verify.valid ? (
            <span className="text-xs text-plasma">✓ Working</span>
          ) : (
            <span className="text-xs text-flare">
              ✗ {expired ? "Session expired — reconnect" : "Not working"}
            </span>
          ))}
      </div>

      {open && (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-ink-faint">
            1. Run <code className="text-ion">claude setup-token</code> in your terminal
            (it opens a browser). 2. Paste the token it prints:
          </p>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="sk-ant-oat…"
            autoComplete="off"
            className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-ink outline-none focus:border-plasma/40"
          />
          <button
            type="button"
            disabled={pending || token.trim().length < 20}
            onClick={() =>
              start(async () => {
                const r = await reconnectClaude(token);
                setMsg(r.message);
                if (r.ok) {
                  setToken("");
                  setOpen(false);
                  setVerify(null);
                }
              })
            }
            className="rounded-lg bg-plasma/15 px-3 py-1.5 text-xs text-plasma transition hover:bg-plasma/25 disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save token"}
          </button>
        </div>
      )}
      {msg && <p className="mt-2 text-xs text-ink-dim">{msg}</p>}
    </div>
  );
}
