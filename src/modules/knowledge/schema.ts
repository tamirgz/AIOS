import {
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

export const KNOWLEDGE_KINDS = [
  "github",
  "instagram",
  "tiktok",
  "youtube",
  "link",
  "quote",
  "text",
] as const;
export type KnowledgeKind = (typeof KNOWLEDGE_KINDS)[number];

export const KNOWLEDGE_STATUSES = [
  "captured",
  "fetching",
  "enriching",
  "ready",
  "error",
] as const;
export type KnowledgeStatus = (typeof KNOWLEDGE_STATUSES)[number];

/** Structured enrichment produced by the AI pipeline. */
export interface KnowledgeInsight {
  summary: string;
  keyIdeas: string[];
  useCases: string[];
  quotes: string[];
  tags: string[];
  relevance: string;
}

export const knowledgeItems = pgTable("knowledge_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  /** Raw pasted input. */
  input: text("input").notNull(),
  kind: text("kind", { enum: KNOWLEDGE_KINDS }).notNull(),
  url: text("url"),
  title: text("title"),
  /** User's own note about why this was saved. */
  note: text("note"),
  status: text("status", { enum: KNOWLEDGE_STATUSES })
    .notNull()
    .default("captured"),
  statusDetail: text("status_detail"),
  /** Fetched source material (readme, oembed, page text …). */
  raw: jsonb("raw"),
  insight: jsonb("insight").$type<KnowledgeInsight>(),
  /** nomic-embed-text vector, filled by the worker's embedding sweep. */
  embedding: vector("embedding", { dimensions: 768 }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type KnowledgeItem = typeof knowledgeItems.$inferSelect;
