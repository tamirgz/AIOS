CREATE TABLE "obsidian_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"path" text NOT NULL,
	"title" text NOT NULL,
	"excerpt" text DEFAULT '' NOT NULL,
	"mtime" timestamp with time zone NOT NULL,
	"embedding" vector(768),
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "obsidian_notes_path" ON "obsidian_notes" USING btree ("path");