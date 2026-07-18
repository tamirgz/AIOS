import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const PROJECT_STATUSES = ["active", "paused", "done"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const projects = pgTable("projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status", { enum: PROJECT_STATUSES })
    .notNull()
    .default("active"),
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
