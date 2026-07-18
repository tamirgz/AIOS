import { pgTable, text, timestamp, uuid, vector } from "drizzle-orm/pg-core";

export const notes = pgTable("notes", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull().default(""),
  tags: text("tags").array(),
  /** nomic-embed-text vector, filled by the worker's embedding sweep. */
  embedding: vector("embedding", { dimensions: 768 }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Note = typeof notes.$inferSelect;
