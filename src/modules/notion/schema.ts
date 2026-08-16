import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Read-only mirror of Notion pages (title + a text snippet), embedded so the
 * Ask engine and semantic search cover Notion alongside notes/vault/knowledge.
 * Token-gated: nothing syncs until a Notion integration token is set.
 */
export const notionPages = pgTable("notion_pages", {
  id: text("id").primaryKey(), // Notion page id (globally unique across workspaces)
  /** Which connected workspace this page came from — its display name. */
  workspace: text("workspace"),
  title: text("title").notNull().default("(untitled)"),
  url: text("url"),
  content: text("content"),
  lastEdited: timestamp("last_edited", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type NotionPage = typeof notionPages.$inferSelect;
