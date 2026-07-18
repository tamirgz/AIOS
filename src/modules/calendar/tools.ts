import { z } from "zod";
import type { AiToolDef } from "@/core/modules/types.server";
import { sql } from "@/core/db/client";
import { getAgenda } from "./agenda";
import { calendarEvents } from "./schema";

export const calendarTools: AiToolDef[] = [
  {
    name: "calendar.agenda",
    description:
      "Get the user's unified agenda: calendar events (incl. synced Google Calendar), task due dates, and content publish dates.",
    input: z.object({
      days: z
        .number()
        .int()
        .min(1)
        .max(60)
        .default(7)
        .describe("How many days ahead to look"),
    }),
    async execute(input) {
      const now = new Date();
      const items = await getAgenda(
        new Date(now.getTime() - 6 * 3600_000),
        new Date(now.getTime() + input.days * 86_400_000),
      );
      return items.map((i) => ({
        kind: i.kind,
        title: i.title,
        at: i.at,
        allDay: i.allDay,
        detail: i.detail,
      }));
    },
  },
  {
    name: "calendar.createEvent",
    risk: "approval",
    description:
      "Create a local AIOS calendar event (not written to Google Calendar).",
    input: z.object({
      title: z.string().min(1),
      startAt: z.string().describe("ISO 8601 start date-time"),
      endAt: z.string().optional().describe("ISO 8601 end date-time"),
      allDay: z.boolean().default(false),
      notes: z.string().optional(),
    }),
    async execute(input, { db }) {
      const [row] = await db
        .insert(calendarEvents)
        .values({
          title: input.title,
          startAt: new Date(input.startAt),
          endAt: input.endAt ? new Date(input.endAt) : null,
          allDay: input.allDay,
          notes: input.notes ?? null,
        })
        .returning();
      await sql.notify("calendar_changed", row.id);
      return { created: { id: row.id, title: row.title, startAt: row.startAt } };
    },
  },
];
