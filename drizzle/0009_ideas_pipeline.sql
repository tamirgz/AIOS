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
INSERT INTO "ideas" ("title", "category", "stage", "notes")
SELECT "title", 'product', 'spark', "notes" FROM "content_items"
ON CONFLICT DO NOTHING;
--> statement-breakpoint
DROP TABLE IF EXISTS "content_items";
