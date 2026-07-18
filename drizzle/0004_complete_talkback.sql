CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"agent_name" text NOT NULL,
	"tool_name" text NOT NULL,
	"input" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "memory_blocks" (
	"label" text PRIMARY KEY NOT NULL,
	"description" text NOT NULL,
	"value" text DEFAULT '' NOT NULL,
	"char_limit" integer DEFAULT 1500 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inbox_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"input" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"triage" jsonb,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "knowledge_items" ADD COLUMN "embedding" vector(768);--> statement-breakpoint
ALTER TABLE "notes" ADD COLUMN "embedding" vector(768);--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "embedding" vector(768);--> statement-breakpoint
CREATE INDEX "approvals_status_created" ON "approvals" USING btree ("status","created_at");