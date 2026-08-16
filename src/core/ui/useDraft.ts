"use client";

import { useEffect, type RefObject } from "react";

/**
 * Persist an uncontrolled textarea/input's value across unmounts (navigating to
 * another module and back) in localStorage, so a half-written question or task
 * isn't lost. Returns `clear()` — call it once the draft has been submitted.
 */
export function useDraft(
  key: string,
  ref: RefObject<HTMLTextAreaElement | HTMLInputElement | null>,
): () => void {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    try {
      const saved = localStorage.getItem(key);
      if (saved && !el.value) {
        el.value = saved;
        // Let the field's own handlers (auto-resize, etc.) react to the restore.
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }
    } catch {
      /* localStorage unavailable — degrade to no persistence */
    }
    const onInput = () => {
      try {
        if (el.value) localStorage.setItem(key, el.value);
        else localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    };
    el.addEventListener("input", onInput);
    return () => el.removeEventListener("input", onInput);
    // ref is stable; re-run only if the storage key changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return () => {
    try {
      localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  };
}
