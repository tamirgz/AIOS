ALTER TABLE "ask_history" ADD COLUMN "project_ref" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "kind" text DEFAULT 'project' NOT NULL;--> statement-breakpoint
ALTER TABLE "workbench_tasks" ADD COLUMN "project_ref" text;