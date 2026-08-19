"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  CalendarDays,
  Clock,
  ExternalLink,
  MapPin,
  Trash2,
  Video,
  X,
} from "lucide-react";
import type { AgendaItem } from "../agenda";

const fmtTime = (d: Date) =>
  d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

function fmtRange(it: AgendaItem) {
  const start = new Date(it.at);
  if (it.allDay) return "all day";
  const end = it.endAt ? new Date(it.endAt) : null;
  if (!end) return fmtTime(start);
  const mins = Math.round((end.getTime() - start.getTime()) / 60_000);
  const dur =
    mins >= 60
      ? `${Math.floor(mins / 60)}h${mins % 60 ? ` ${mins % 60}m` : ""}`
      : `${mins}m`;
  return `${fmtTime(start)} – ${fmtTime(end)} · ${dur}`;
}

/** Meet / Zoom / Teams — label the button with what it actually opens. */
function providerOf(url: string) {
  if (url.includes("meet.google.com")) return "google meet";
  if (url.includes("zoom.us")) return "zoom";
  if (url.includes("teams.microsoft")) return "microsoft teams";
  if (url.includes("webex.com")) return "webex";
  return "video call";
}

/**
 * Google event descriptions arrive as HTML fragments (`<br>`, `<a href>`),
 * never markdown — so render them as text: unwrap the markup, then linkify
 * bare URLs ourselves rather than injecting untrusted HTML.
 */
function DescriptionText({ html }: { html: string }) {
  const text = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return (
    <p dir="auto" className="whitespace-pre-wrap text-sm leading-relaxed text-ink-dim">
      {text.split(/(https?:\/\/[^\s<>"]+)/g).map((part, i) =>
        /^https?:\/\//.test(part) ? (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noreferrer"
            className="break-all text-ion underline decoration-ion/30 underline-offset-2 hover:decoration-ion"
          >
            {part}
          </a>
        ) : (
          part
        ),
      )}
    </p>
  );
}

function Row({
  icon: Icon,
  children,
}: {
  icon: typeof Clock;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-ink-faint" />
      <div className="min-w-0 flex-1 text-sm text-ink-dim">{children}</div>
    </div>
  );
}

/**
 * Slide-over with everything apOS knows about one agenda entry: when, where,
 * the description, and — for meetings — a one-click JOIN.
 */
export function EventDetail({
  item,
  onClose,
  onDelete,
  deletePending,
}: {
  item: AgendaItem | null;
  onClose: () => void;
  onDelete: (id: string) => void;
  deletePending: boolean;
}) {
  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [item, onClose]);

  return (
    <AnimatePresence>
      {item && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-void/70 backdrop-blur-sm"
          />
          <motion.aside
            initial={{ x: "100%", opacity: 0.6 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: "100%", opacity: 0.4 }}
            transition={{ type: "spring", stiffness: 320, damping: 34 }}
            role="dialog"
            aria-modal="true"
            aria-label={item.title}
            className="glass fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col gap-5 overflow-y-auto rounded-l-2xl p-6"
          >
            <div className="flex items-start gap-3">
              <span
                className="mt-1.5 size-2.5 shrink-0 rounded-full"
                style={{
                  background: item.accent,
                  boxShadow: `0 0 12px ${item.accent}`,
                }}
              />
              <h2
                dir="auto"
                className="flex-1 font-display text-xl leading-snug font-semibold text-ink"
              >
                {item.title}
              </h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="rounded-lg p-1.5 text-ink-faint transition hover:bg-white/6 hover:text-ink"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <Row icon={CalendarDays}>
                {new Date(item.at).toLocaleDateString(undefined, {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </Row>
              <Row icon={Clock}>{fmtRange(item)}</Row>
              {/* Zoom invites put the join URL in `location`; the JOIN button
                  already covers it, so don't print the same link twice. */}
              {item.location && item.location !== item.meetingUrl && (
                <Row icon={MapPin}>
                  <a
                    dir="auto"
                    href={
                      /^https?:\/\//.test(item.location)
                        ? item.location
                        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.location)}`
                    }
                    target="_blank"
                    rel="noreferrer"
                    className="underline decoration-white/15 underline-offset-2 transition hover:text-ink hover:decoration-ion"
                  >
                    {item.location}
                  </a>
                </Row>
              )}
            </div>

            {item.meetingUrl && (
              <a
                href={item.meetingUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-2 rounded-xl border border-plasma/30 bg-plasma/15 py-3 font-mono text-[11px] uppercase tracking-[0.2em] text-plasma transition hover:bg-plasma/25"
              >
                <Video className="size-4" />
                join {providerOf(item.meetingUrl)}
              </a>
            )}

            {item.notes && (
              <section className="rounded-xl border border-white/6 bg-abyss/40 p-4">
                <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.3em] text-ink-faint">
                  details
                </p>
                <DescriptionText html={item.notes} />
              </section>
            )}

            <div className="mt-auto flex items-center gap-2 border-t border-white/6 pt-4">
              {item.sourceUrl && (
                <a
                  href={item.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 rounded-lg border border-white/8 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-ink-dim transition hover:border-ion/30 hover:text-ion"
                >
                  <ExternalLink className="size-3" />
                  open in google calendar
                </a>
              )}
              {item.deletable && (
                <button
                  type="button"
                  disabled={deletePending}
                  onClick={() => onDelete(item.id)}
                  className="ml-auto flex items-center gap-1.5 rounded-lg border border-white/8 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-ink-faint transition hover:border-flare/30 hover:text-flare disabled:opacity-40"
                >
                  <Trash2 className="size-3" />
                  delete
                </button>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
