ALTER TABLE "projects" ADD COLUMN "advisor_state" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "advisor_blocker" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "advisor_next" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "advisor_updated_at" timestamp with time zone;