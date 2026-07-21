CREATE TABLE "attempt_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "executors" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"command_template" text,
	"default_model" text,
	"git_mode" text DEFAULT 'none' NOT NULL,
	"timeout_ms" integer DEFAULT 900000 NOT NULL,
	"enabled" text DEFAULT 'true' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"task_id" uuid NOT NULL,
	"seq" integer DEFAULT 1 NOT NULL,
	"executor_id" text NOT NULL,
	"model" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"workdir" text,
	"branch" text,
	"base_sha" text,
	"pid" integer,
	"exit_code" integer,
	"error" text,
	"result" text,
	"input_tokens" integer,
	"output_tokens" integer,
	"cost_usd" text,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"heartbeat_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workbench_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"prompt" text NOT NULL,
	"task_type" text DEFAULT 'research' NOT NULL,
	"repo_path" text,
	"status" text DEFAULT 'queued' NOT NULL,
	"created_from" text,
	"summary" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "attempt_events_attempt" ON "attempt_events" USING btree ("attempt_id","at");--> statement-breakpoint
CREATE INDEX "task_attempts_task" ON "task_attempts" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "task_attempts_status" ON "task_attempts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "workbench_tasks_status" ON "workbench_tasks" USING btree ("status");