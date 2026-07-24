CREATE TABLE "people" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"meeting_count" integer DEFAULT 0 NOT NULL,
	"first_seen_at" timestamp with time zone,
	"last_seen_at" timestamp with time zone,
	"last_event_title" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "calendar_events" ADD COLUMN "attendees" jsonb;--> statement-breakpoint
ALTER TABLE "attention_items" ADD COLUMN "person_ref" text;--> statement-breakpoint
CREATE UNIQUE INDEX "people_email" ON "people" USING btree ("email");--> statement-breakpoint
CREATE INDEX "people_last_seen" ON "people" USING btree ("last_seen_at");--> statement-breakpoint
CREATE INDEX "attention_person" ON "attention_items" USING btree ("person_ref");