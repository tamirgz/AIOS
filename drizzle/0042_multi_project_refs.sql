ALTER TABLE "ask_history" ADD COLUMN "project_refs" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
UPDATE "ask_history" SET "project_refs" = jsonb_build_array("project_ref") WHERE "project_ref" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "ask_history" DROP COLUMN "project_ref";--> statement-breakpoint
ALTER TABLE "workbench_tasks" ADD COLUMN "project_refs" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
UPDATE "workbench_tasks" SET "project_refs" = jsonb_build_array("project_ref") WHERE "project_ref" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "workbench_tasks" DROP COLUMN "project_ref";
