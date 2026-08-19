import { z } from "zod";
import { and, asc, eq, ilike } from "drizzle-orm";
import type { AiToolDef } from "@/core/modules/types.server";
import { registerRefs, resolveRef } from "@/core/ai/refs";
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
      projectId: z
        .string()
        .uuid()
        .optional()
        .describe("Project/area to file this task under (from projects.list)"),
    }),
    async execute(input, { db }) {
      const [row] = await db
        .insert(tasks)
        .values({
          title: input.title,
          notes: input.notes ?? null,
          priority: input.priority,
          dueAt: input.dueAt ? new Date(input.dueAt) : null,
          projectRef: input.projectId ? `projects:${input.projectId}` : null,
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
    async execute(input, ctx) {
      const filters = [
        input.status ? eq(tasks.status, input.status) : undefined,
        input.search ? ilike(tasks.title, `%${input.search}%`) : undefined,
      ].filter((f) => f !== undefined);
      const rows = await ctx.db
        .select()
        .from(tasks)
        .where(filters.length ? and(...filters) : undefined)
        .orderBy(priorityRank, asc(tasks.createdAt))
        .limit(input.limit);
      // Each task gets a short handle (t1, t2…); a write targets it by that ref,
      // never a uuid — so a status change can't land on the wrong task.
      return registerRefs(
        ctx,
        "task",
        "t",
        rows.map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          priority: t.priority,
          dueAt: t.dueAt,
          createdAt: t.createdAt,
          completedAt: t.completedAt,
        })),
      );
    },
  },
  {
    name: "tasks.setStatus",
    description:
      "Move a task to a new status (todo | doing | done). Identify the task by its `ref` from tasks.list (e.g. 't3') — never a raw id.",
    input: z.object({
      ref: z.string().describe("Task ref from tasks.list, e.g. 't3'"),
      status: z.enum(TASK_STATUSES),
    }),
    async execute(input, ctx) {
      const t = resolveRef(ctx, "task", input.ref);
      if ("error" in t) return t;
      const [row] = await ctx.db
        .update(tasks)
        .set({
          status: input.status,
          completedAt: input.status === "done" ? new Date() : null,
        })
        .where(eq(tasks.id, t.id))
        .returning();
      return row
        ? { updated: { id: row.id, status: row.status } }
        : { error: "task not found" };
    },
  },
  {
    name: "tasks.update",
    description:
      "Edit a task's fields (title, notes, priority, due date, or the project it's filed under). Only pass the fields you want to change. Find the id via tasks.list.",
    input: z.object({
      id: z.string().uuid(),
      title: z.string().min(1).optional(),
      notes: z.string().optional(),
      priority: z.enum(TASK_PRIORITIES).optional(),
      dueAt: z.string().optional().describe("ISO 8601; empty string clears it"),
      projectId: z
        .string()
        .optional()
        .describe("Project/area uuid to file under; empty string unfiles"),
    }),
    async execute(input, { db }) {
      const patch: Record<string, unknown> = {};
      if (input.title !== undefined) patch.title = input.title;
      if (input.notes !== undefined) patch.notes = input.notes || null;
      if (input.priority !== undefined) patch.priority = input.priority;
      if (input.dueAt !== undefined) patch.dueAt = input.dueAt ? new Date(input.dueAt) : null;
      if (input.projectId !== undefined)
        patch.projectRef = input.projectId ? `projects:${input.projectId}` : null;
      if (Object.keys(patch).length === 0) return { error: "nothing to update" };
      const [row] = await db
        .update(tasks)
        .set(patch)
        .where(eq(tasks.id, input.id))
        .returning();
      return row ? { updated: { id: row.id, title: row.title } } : { error: "task not found" };
    },
  },
  {
    name: "tasks.delete",
    description: "Delete a task permanently. Find the id via tasks.list.",
    risk: "approval",
    input: z.object({ id: z.string().uuid() }),
    async execute(input, { db }) {
      const [row] = await db.delete(tasks).where(eq(tasks.id, input.id)).returning();
      return row ? { deleted: row.id } : { error: "task not found" };
    },
  },
];
