import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { embeddingVector } from "@/core/db/vector";

export const PROJECT_STATUSES = ["active", "paused", "done"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const projects = pgTable("projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status", { enum: PROJECT_STATUSES })
    .notNull()
    .default("active"),
  /**
   * The single next physical step (GTD). Life-OS L1: this is what wires a
   * project to the day — Plan-my-day pulls active projects' next-actions as
   * "do" suggestions, and the chaser flags a missing or stale one. Derived by
   * the Project-pulse agent (L2), settable by hand.
   */
  nextAction: text("next_action"),
  /** name + description embedding, for the relations/suggestions layer. */
  embedding: embeddingVector("embedding"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Project = typeof projects.$inferSelect;

/** Sort helper: active → paused → done (text enum, so plain asc would be wrong). */
export const statusRank = sql`case ${projects.status} when 'active' then 0 when 'paused' then 1 else 2 end`;

/** The entity ref stored in tasks.projectRef for a given project row. */
export function projectRefOf(id: string) {
  return `projects:${id}`;
}
