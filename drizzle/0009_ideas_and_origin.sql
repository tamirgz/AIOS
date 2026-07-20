-- Idempotent: the ideas table was first applied by hand (manual_0009_ideas_pipeline);
-- this migration re-establishes the drizzle snapshot chain and adds
-- external_reports.origin for Slack-sourced reports.
CREATE TABLE IF NOT EXISTS "ideas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"category" text DEFAULT 'product' NOT NULL,
	"stage" text DEFAULT 'spark' NOT NULL,
	"notes" text,
	"analysis_status" text DEFAULT 'none' NOT NULL,
	"analysis" jsonb,
	"analysis_error" text,
	"project_ref" text,
	"embedding" vector,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP TABLE IF EXISTS "content_items" CASCADE;--> statement-breakpoint
ALTER TABLE "external_reports" ADD COLUMN IF NOT EXISTS "origin" text;
