import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { embeddingVector } from "@/core/db/vector";

export const TASK_STATUSES = ["todo", "doing", "done"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ["low", "medium", "high"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const tasks = pgTable("tasks", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  notes: text("notes"),
  status: text("status", { enum: TASK_STATUSES }).notNull().default("todo"),
  priority: text("priority", { enum: TASK_PRIORITIES })
    .notNull()
    .default("medium"),
  dueAt: timestamp("due_at", { withTimezone: true }),
  /** Cross-module entity ref, e.g. "projects:<uuid>" — text, not FK, so modules stay droppable. */
  projectRef: text("project_ref"),
  /**
   * Optional "features:<uuid>" ref when this task is part of a multi-task
   * feature. featureRef set → task belongs to that feature (and still carries
   * the feature's projectRef so it rolls up to the project); null → a
   * standalone project/loose task.
   */
  featureRef: text("feature_ref"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  /** nomic-embed-text vector, filled by the worker's embedding sweep. */
  embedding: embeddingVector("embedding"),
});

export type Task = typeof tasks.$inferSelect;

/** Sort helper: high → medium → low (text enum, so plain desc would be wrong). */
export const priorityRank = sql`case ${tasks.priority} when 'high' then 0 when 'medium' then 1 else 2 end`;
