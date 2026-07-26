import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { embeddingVector } from "@/core/db/vector";

export const PROJECT_STATUSES = ["active", "paused", "done", "archived"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/**
 * Life-OS L2 health. Derived cheaply on read (so the cockpit always shows one,
 * even before any agent runs), then refined by the Project-pulse agent, which
 * can also set "blocked" — a judgement the heuristic can't make.
 */
export const PROJECT_HEALTHS = [
  "on_track",
  "at_risk",
  "stalled",
  "blocked",
] as const;
export type ProjectHealth = (typeof PROJECT_HEALTHS)[number];

export const projects = pgTable("projects", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status", { enum: PROJECT_STATUSES })
    .notNull()
    .default("active"),
  /**
   * The north-star outcome this project is for (one line). L2: the Project-pulse
   * agent proposes one when it's missing; the user can overwrite it.
   */
  goal: text("goal"),
  /**
   * The single next physical step (GTD). Life-OS L1: this is what wires a
   * project to the day — Plan-my-day pulls active projects' next-actions as
   * "do" suggestions, and the chaser flags a missing or stale one. Derived by
   * the Project-pulse agent (L2), settable by hand.
   */
  nextAction: text("next_action"),
  /**
   * L2 health, as last written by the Project-pulse agent. Nullable: when null
   * (or stale) the cockpit falls back to the read-time heuristic, so a project
   * always shows a health without anyone setting it.
   */
  health: text("health", { enum: PROJECT_HEALTHS }),
  /** One-line "why" behind `health` — shown in the cockpit. */
  healthReason: text("health_reason"),
  /** When the agent last wrote `health` (staleness gate for the fallback). */
  healthUpdatedAt: timestamp("health_updated_at", { withTimezone: true }),
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
export const statusRank = sql`case ${projects.status} when 'active' then 0 when 'paused' then 1 when 'done' then 2 else 3 end`;

/** The entity ref stored in tasks.projectRef for a given project row. */
export function projectRefOf(id: string) {
  return `projects:${id}`;
}
