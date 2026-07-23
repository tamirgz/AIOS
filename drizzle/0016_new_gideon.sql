CREATE TABLE "attention_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" text DEFAULT 'notify' NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"project_ref" text,
	"source" text DEFAULT 'system' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"urgency" integer DEFAULT 0 NOT NULL,
	"due_at" timestamp with time zone,
	"snoozed_until" timestamp with time zone,
	"href" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dedupe_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "next_action" text;--> statement-breakpoint
CREATE INDEX "attention_status" ON "attention_items" USING btree ("status","urgency");--> statement-breakpoint
CREATE INDEX "attention_project" ON "attention_items" USING btree ("project_ref");--> statement-breakpoint
CREATE INDEX "attention_dedupe" ON "attention_items" USING btree ("dedupe_key");