import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, sql } from "@/core/db/client";
import type { AiToolDef } from "@/core/modules/types.server";
import { TYPE_DEFAULT_EXECUTOR } from "./defaults";
import { TASK_TYPES, taskAttempts, workbenchTasks } from "./schema";

/**
 * Delegation as a tool: chat and agents can hand work to the Workbench
 * instead of trying to do long jobs inside their own turn limit.
 */
export const workbenchTools: AiToolDef[] = [
  {
    name: "workbench.delegate",
    description:
      "Delegate a one-off task to a background executor (research, code, docs). Returns immediately with a task id; the work happens unattended and the user reviews it in the Workbench. Use for anything that needs more than a couple of tool calls.",
    input: z.object({
      prompt: z
        .string()
        .min(10)
        .describe("The full instruction for the executor, self-contained."),
      taskType: z.enum(TASK_TYPES).describe("research | code | docs | custom"),
      repoPath: z
        .string()
        .optional()
        .describe("Absolute repo path — required for code tasks."),
    }),
    execute: async (i: {
      prompt: string;
      taskType: (typeof TASK_TYPES)[number];
      repoPath?: string;
    }) => {
      const first = i.prompt.trim().split("\n")[0].slice(0, 88);
      const [task] = await db
        .insert(workbenchTasks)
        .values({
          title: first,
          prompt: i.prompt.trim(),
          taskType: i.taskType,
          repoPath: i.repoPath ?? null,
          createdFrom: "ai",
        })
        .returning();
      const [attempt] = await db
        .insert(taskAttempts)
        .values({
          taskId: task.id,
          seq: 1,
          executorId: TYPE_DEFAULT_EXECUTOR[i.taskType],
        })
        .returning();
      await sql.notify("workbench_run", attempt.id);
      return { taskId: task.id, status: "queued", url: `/m/workbench/${task.id}` };
    },
  },
  {
    name: "workbench.list",
    description:
      "List recent Workbench tasks with their status and result summary.",
    input: z.object({
      status: z.string().optional().describe("Filter, e.g. 'review' or 'running'."),
      limit: z.number().int().min(1).max(50).optional(),
    }),
    execute: async (i: { status?: string; limit?: number }) => {
      const rows = await db
        .select()
        .from(workbenchTasks)
        .orderBy(desc(workbenchTasks.createdAt))
        .limit(i.limit ?? 15);
      return rows
        .filter((r) => !i.status || r.status === i.status)
        .map((r) => ({
          id: r.id,
          title: r.title,
          type: r.taskType,
          status: r.status,
          summary: r.summary?.slice(0, 400) ?? null,
        }));
    },
  },
  {
    name: "workbench.get",
    description:
      "Read one Workbench task in full: prompt, status, result and attempt history.",
    input: z.object({ taskId: z.string().uuid() }),
    execute: async (i: { taskId: string }) => {
      const [task] = await db
        .select()
        .from(workbenchTasks)
        .where(eq(workbenchTasks.id, i.taskId));
      if (!task) return { error: "not found" };
      const attempts = await db
        .select()
        .from(taskAttempts)
        .where(eq(taskAttempts.taskId, i.taskId));
      return {
        ...task,
        attempts: attempts.map((a) => ({
          seq: a.seq,
          executor: a.executorId,
          status: a.status,
          branch: a.branch,
          result: a.result?.slice(0, 2000) ?? null,
          error: a.error,
        })),
      };
    },
  },
];
