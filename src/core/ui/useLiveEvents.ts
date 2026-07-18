"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

/**
 * Subscribe to the server's SSE bridge (Postgres NOTIFY → EventSource) and
 * refresh server-component data when relevant channels fire.
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
    const es = new EventSource("/api/events");
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    es.onmessage = (e) => {
      try {
        const { channel, payload } = JSON.parse(e.data) as {
          channel: string;
          payload: string;
        };
        if (!wanted.has(channel)) return;
        onEventRef.current?.(channel, payload);
        // Debounce router.refresh — transcripts can NOTIFY very frequently.
        if (refreshTimer) clearTimeout(refreshTimer);
        refreshTimer = setTimeout(() => router.refresh(), 350);
      } catch {
        // ignore malformed frames
      }
    };

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      es.close();
    };
  }, [channelsKey, router]);
}
