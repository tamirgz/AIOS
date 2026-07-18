"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

type Listener = (channel: string, payload: string) => void;

/**
 * ONE EventSource per browser tab, shared by every subscriber. Each SSE
 * client holds a dedicated Postgres LISTEN connection server-side, so
 * per-component streams would multiply DB connections for no benefit.
 */
let es: EventSource | null = null;
const listeners = new Set<Listener>();

function ensureStream() {
  if (es) return;
  es = new EventSource("/api/events");
  es.onmessage = (e) => {
    try {
      const { channel, payload } = JSON.parse(e.data) as {
        channel: string;
        payload: string;
      };
      for (const l of listeners) l(channel, payload);
    } catch {
      // ignore malformed frames
    }
  };
  es.onerror = () => {
    // Browser auto-reconnects EventSource; nothing to do.
  };
}

function releaseStream() {
  if (listeners.size === 0 && es) {
    es.close();
    es = null;
  }
}

/**
 * Subscribe to server NOTIFY channels and refresh server-component data when
 * relevant channels fire (debounced — transcripts can NOTIFY very often).
 */
export function useLiveEvents(
  channels: string[],
  onEvent?: (channel: string, payload: string) => void,
) {
  const router = useRouter();
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const channelsKey = channels.join(",");

  useEffect(() => {
    const wanted = new Set(channelsKey.split(","));
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const listener: Listener = (channel, payload) => {
      if (!wanted.has(channel)) return;
      onEventRef.current?.(channel, payload);
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => router.refresh(), 350);
    };

    listeners.add(listener);
    ensureStream();

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      listeners.delete(listener);
      releaseStream();
    };
  }, [channelsKey, router]);
}
