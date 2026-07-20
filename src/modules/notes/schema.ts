import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { embeddingVector } from "@/core/db/vector";

export const notes = pgTable("notes", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  tags: text("tags").array(),
  /** Cross-module entity ref: "projects:<uuid>" — text, not FK, so modules stay droppable. */
  projectRef: text("project_ref"),
  /** nomic-embed-text vector, filled by the worker's embedding sweep. */
  embedding: embeddingVector("embedding"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Note = typeof notes.$inferSelect;
