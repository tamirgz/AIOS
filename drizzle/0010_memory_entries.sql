CREATE TABLE "memory_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text DEFAULT 'fact' NOT NULL,
	"text" text NOT NULL,
	"source" text NOT NULL,
	"embedding" vector,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "memory_entries_created" ON "memory_entries" USING btree ("created_at");