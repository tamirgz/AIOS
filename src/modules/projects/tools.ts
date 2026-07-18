import { z } from "zod";
import { eq } from "drizzle-orm";
import type { AiToolDef } from "@/core/modules/types.server";
import { getProjectsWithTaskCounts } from "./queries";
import { projects, PROJECT_STATUSES } from "./schema";

export const projectTools: AiToolDef[] = [
  {
    name: "projects.create",
    description:
      "Create a new project. Use for any multi-task effort the user wants to track.",
    input: z.object({
      name: z.string().min(1).describe("Short project name"),
      description: z
        .string()
        .optional()
        .describe("One-line summary of the project's goal"),
    }),
    async execute(input, { db }) {
      const [row] = await db
        .insert(projects)
        .values({
          name: input.name,
          description: input.description ?? null,
        })
        .returning();
      return { created: { id: row.id, name: row.name } };
    },
  },
  {
    name: "projects.list",
    description:
      "List projects with their status and linked-task counts (active first).",
    input: z.object({}),
    async execute(_input, { db }) {
      const rows = await getProjectsWithTaskCounts(db);
      return rows.map((p) => ({
        id: p.id,
        name: p.name,
        status: p.status,
        taskCounts: p.taskCounts,
      }));
    },
  },
  {
    name: "projects.setStatus",
    description:
      "Set a project's status (active | paused | done). Find the id via projects.list first.",
    input: z.object({
      id: z.string().uuid(),
      status: z.enum(PROJECT_STATUSES),
    }),
    async execute(input, { db }) {
      const [row] = await db
        .update(projects)
        .set({ status: input.status, updatedAt: new Date() })
        .where(eq(projects.id, input.id))
        .returning();
      return row
        ? { updated: { id: row.id, status: row.status } }
        : { error: "project not found" };
    },
  },
];
