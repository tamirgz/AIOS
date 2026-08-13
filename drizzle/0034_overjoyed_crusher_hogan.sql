CREATE TABLE "routines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"project_id" uuid,
	"repo_path" text,
	"prompt" text NOT NULL,
	"executor_id" text DEFAULT 'opencode' NOT NULL,
	"model" text,
	"trigger_kind" text DEFAULT 'commit' NOT NULL,
	"schedule" text,
	"deliver_pr" text DEFAULT 'true' NOT NULL,
	"enabled" text DEFAULT 'true' NOT NULL,
	"last_seen_sha" text,
	"last_fired_at" timestamp with time zone,
	"last_task_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workbench_tasks" ADD COLUMN "pr_url" text;--> statement-breakpoint
CREATE INDEX "routines_enabled" ON "routines" USING btree ("enabled");