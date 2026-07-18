import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const CONTENT_KINDS = ["post", "article", "video", "idea"] as const;
export type ContentKind = (typeof CONTENT_KINDS)[number];

export const CONTENT_STAGES = ["idea", "draft", "review", "published"] as const;
export type ContentStage = (typeof CONTENT_STAGES)[number];

export const contentItems = pgTable("content_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  kind: text("kind", { enum: CONTENT_KINDS }).notNull().default("post"),
  stage: text("stage", { enum: CONTENT_STAGES }).notNull().default("idea"),
  notes: text("notes"),
  publishAt: timestamp("publish_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type ContentItem = typeof contentItems.$inferSelect;

/** Sort helper: scheduled items first (soonest publish), unscheduled last. */
export const publishAtNullsLast = sql`${contentItems.publishAt} asc nulls last`;
