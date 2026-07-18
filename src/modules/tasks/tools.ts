import { z } from "zod";
import { and, asc, eq, ilike } from "drizzle-orm";
import type { AiToolDef } from "@/core/modules/types.server";
import {
  priorityRank,
  tasks,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from "./schema";

export const taskTools: AiToolDef[] = [
  {
    name: "tasks.create",
    description:
      "Create a new task. Use for anything the user wants to remember to do.",
    input: z.object({
      title: z.string().min(1).describe("Short imperative task title"),
      notes: z.string().optional().describe("Extra details"),
      priority: z.enum(TASK_PRIORITIES).default("medium"),
      dueAt: z
        .string()
        .optional()
        .describe("Due date-time in ISO 8601, if the user gave one"),
    }),
    async execute(input, { db }) {
      const [row] = await db
        .insert(tasks)
        .values({
          title: input.title,
          notes: input.notes ?? null,
          priority: input.priority,
          dueAt: input.dueAt ? new Date(input.dueAt) : null,
        })
        .returning();
      return { created: { id: row.id, title: row.title } };
    },
  },
  {
    name: "tasks.list",
    description:
      "List tasks, optionally filtered by status (todo | doing | done) or a title search.",
    input: z.object({
      status: z.enum(TASK_STATUSES).optional(),
      search: z.string().optional().describe("Case-insensitive title filter"),
      limit: z.number().int().min(1).max(100).default(50),
    }),
    async execute(input, { db }) {
      const filters = [
        input.status ? eq(tasks.status, input.status) : undefined,
        input.search ? ilike(tasks.title, `%${input.search}%`) : undefined,
      ].filter((f) => f !== undefined);
      const rows = await db
        .select()
        .from(tasks)
        .where(filters.length ? and(...filters) : undefined)
        .orderBy(priorityRank, asc(tasks.createdAt))
        .limit(input.limit);
      return rows.map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        dueAt: t.dueAt,
        createdAt: t.createdAt,
        completedAt: t.completedAt,
      }));
    },
  },
  {
    name: "tasks.setStatus",
    description:
      "Move a task to a new status (todo | doing | done). Find the id via tasks.list first.",
    input: z.object({
      id: z.string().uuid(),
      status: z.enum(TASK_STATUSES),
    }),
    async execute(input, { db }) {
      const [row] = await db
        .update(tasks)
        .set({
          status: input.status,
          completedAt: input.status === "done" ? new Date() : null,
        })
        .where(eq(tasks.id, input.id))
        .returning();
      return row
        ? { updated: { id: row.id, status: row.status } }
        : { error: "task not found" };
    },
  },
];
