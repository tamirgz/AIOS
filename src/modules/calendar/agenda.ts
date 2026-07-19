import { and, asc, gte, isNotNull, lte, ne } from "drizzle-orm";
import { db } from "@/core/db/client";
import { tasks } from "../tasks/schema";
import { contentItems } from "../content/schema";
import { calendarEvents } from "./schema";

export interface AgendaItem {
  id: string;
  kind: "event" | "task" | "content";
  title: string;
  at: Date;
  endAt: Date | null;
  allDay: boolean;
  detail: string | null;
  href: string;
  accent: string;
  /** Only AIOS-local events may be deleted from AIOS. */
  deletable: boolean;
}

/**
 * The unified agenda: calendar events (local + Google/ICS) merged with task
 * due dates and content publish dates — the cross-module view that makes the
 * calendar useful even before any events exist.
 */
export async function getAgenda(from: Date, to: Date): Promise<AgendaItem[]> {
  const [events, dueTasks, publishing] = await Promise.all([
    db
      .select()
      .from(calendarEvents)
      .where(
        and(gte(calendarEvents.startAt, from), lte(calendarEvents.startAt, to)),
      )
      .orderBy(asc(calendarEvents.startAt)),
    db
      .select()
      .from(tasks)
      .where(
        and(
          isNotNull(tasks.dueAt),
          gte(tasks.dueAt, from),
          lte(tasks.dueAt, to),
          ne(tasks.status, "done"),
        ),
      ),
    db
      .select()
      .from(contentItems)
      .where(
        and(
          isNotNull(contentItems.publishAt),
          gte(contentItems.publishAt, from),
          lte(contentItems.publishAt, to),
        ),
      ),
  ]);

  const items: AgendaItem[] = [
    ...events.map((e) => ({
      id: e.id,
      kind: "event" as const,
      title: e.title,
      at: e.startAt,
      endAt: e.endAt,
      allDay: e.allDay,
      detail: e.location ?? (e.source !== "local" ? "google" : null),
      href: "/m/calendar",
      // The event's own Google color wins; category color is the fallback.
      accent:
        e.color ??
        (e.source !== "local" ? "var(--color-ion)" : "var(--color-plasma)"),
      deletable: e.source === "local",
    })),
    ...dueTasks.map((t) => ({
      id: t.id,
      kind: "task" as const,
      title: t.title,
      at: t.dueAt!,
      endAt: null,
      allDay: false,
      detail: `${t.priority} priority`,
      href: "/m/tasks",
      accent: "var(--color-solar)",
      deletable: false,
    })),
    ...publishing.map((c) => ({
      id: c.id,
      kind: "content" as const,
      title: c.title,
      at: c.publishAt!,
      endAt: null,
      allDay: false,
      detail: `publish · ${c.kind}`,
      href: "/m/content",
      accent: "var(--color-violet)",
      deletable: false,
    })),
  ];

  return items.sort((a, b) => a.at.getTime() - b.at.getTime());
}
