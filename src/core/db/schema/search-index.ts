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
 * This table is the single place ALL sources flow into: one row per source
 * item, embedded by the same local sweep, searched by one query. Phase 2 folded
 * the per-table sources (notes, tasks, ideas, knowledge, vault, Notion, files,
 * projects, attention, memory) in here too, so there is now ONE vector space,
 * one sweep, and one query surface every consumer (search, relations, project
 * suggestions, memory recall, agents) reads from. Phase 3 grounds `areaRef`.
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
    /** Short human-facing preview (truncated for display). */
    snippet: text("snippet"),
    /**
     * The RICH text actually embedded — a note's full body, a vault excerpt, a
     * project's linked-work titles — kept separate from the short display
     * `snippet` so long-form sources don't lose their signal to truncation. The
     * sweep embeds `coalesce(embed_text, title || snippet)`; short external
     * sources (mail, events…) leave it null and embed title+snippet as before.
     */
    embedText: text("embed_text"),
    /** Where clicking the hit goes. */
    href: text("href"),
    /** Projects/areas this item belongs to (precise, user- or source-set). */
    projectRefs: jsonb("project_refs").$type<string[]>().notNull().default([]),
    /**
     * Coarse "drawer" this item was auto-classified into — an area-of-development
     * ref ("projects:<area-uuid>"), or "none" when it fits no area. Null = not
     * yet classified. Assigned by a LOCAL LLM (topic, cross-language) rather than
     * embeddings, which cluster by language. Retrieval opens the relevant drawer
     * for a query instead of tagging items to a wrong specific project.
     */
    areaRef: text("area_ref"),
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
