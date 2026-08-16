ALTER TABLE "notes" ADD COLUMN "project_refs" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
-- Backfill: carry each note's existing single project_ref into the new array.
UPDATE "notes" SET "project_refs" = jsonb_build_array("project_ref") WHERE "project_ref" IS NOT NULL AND "project_ref" <> '';