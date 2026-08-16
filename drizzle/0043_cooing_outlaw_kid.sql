CREATE TABLE "search_index" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"source_id" text NOT NULL,
	"title" text NOT NULL,
	"snippet" text,
	"href" text,
	"project_refs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"embedding" vector,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "search_index_kind_source" UNIQUE("kind","source_id")
);
--> statement-breakpoint
CREATE INDEX "search_index_kind" ON "search_index" USING btree ("kind");