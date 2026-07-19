"use client";

import { useTransition } from "react";
import { CalendarCheck2, Unplug } from "lucide-react";
import { disconnectGoogle } from "../actions";

export function GoogleConnect({
  hasCredentials,
  connected,
}: {
  hasCredentials: boolean;
  connected: boolean;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <div className="glass rounded-xl p-3">
      <p className="text-sm text-ink">
        Google Calendar API{" "}
        <span className="font-mono text-[9px] uppercase tracking-widest text-ink-faint">
          per-event colors + reliable recurrence
        </span>
      </p>
      <p className="mb-2 text-xs leading-snug text-ink-dim">
        Connect with OAuth to sync your primary calendar with your real event
        colors. Fill client id + secret above first. Replaces the ICS sync
        while connected.
      </p>
      <div className="flex items-center gap-3">
        {connected ? (
          <>
            <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-widest text-plasma">
              <CalendarCheck2 className="size-3.5" /> connected
            </span>
            <button
              type="button"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  await disconnectGoogle();
                })
              }
              className="flex items-center gap-1.5 rounded-lg border border-flare/25 px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-flare transition hover:bg-flare/10"
            >
              <Unplug className="size-3" /> disconnect
            </button>
          </>
        ) : (
          <a
            href="/api/google/auth"
            aria-disabled={!hasCredentials}
            className={
              hasCredentials
                ? "rounded-lg bg-plasma/15 px-4 py-2 font-mono text-[11px] uppercase tracking-widest text-plasma transition hover:bg-plasma/25"
                : "pointer-events-none rounded-lg border border-white/8 px-4 py-2 font-mono text-[11px] uppercase tracking-widest text-ink-faint"
            }
          >
            connect google calendar
          </a>
        )}
      </div>
    </div>
  );
}
