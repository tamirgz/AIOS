import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { embeddingVector } from "@/core/db/vector";

/**
 * Unified semantic index (Phase 2 foundation).
 *
 * The original design gave each module its own `embedding` column and stitched
 * them together with a hand-written UNION in `searchEverything`, so any source
 * without those three touch-points (a vector column, a sweep branch, a UNION
 * branch) was invisible to search — which is how Gmail, Calendar, Telegram,
 * reports, People, Inbox, and even our own Workbench results / Ask answers fell
 * out of the corpus.
 *
 * This table is the single place those "extra" sources flow into: one row per
 * source item, embedded by the same local sweep, searched by one query. Phase 2
 * migrates the per-table sources here too; Phase 3 grounds `projectRefs`.
 */
export const searchIndex = pgTable(
  "search_index",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /** mail | event | telegram | report | person | inbox | workbench | ask … */
    kind: text("kind").notNull(),
    /** The source row's id, so a re-sync upserts instead of duplicating. */
    sourceId: text("source_id").notNull(),
    title: text("title").notNull(),
    snippet: text("snippet"),
    /** Where clicking the hit goes. */
    href: text("href"),
    /** Projects/areas this item belongs to (Phase 3 grounds the orphaned ones). */
    projectRefs: jsonb("project_refs").$type<string[]>().notNull().default([]),
    /** Hash of the embedded text; on change the sync nulls `embedding` to re-embed. */
    contentHash: text("content_hash").notNull(),
    /** Local nomic-embed-text vector, filled by the worker's embedding sweep. */
    embedding: embeddingVector("embedding"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("search_index_kind_source").on(t.kind, t.sourceId),
    index("search_index_kind").on(t.kind),
  ],
);
