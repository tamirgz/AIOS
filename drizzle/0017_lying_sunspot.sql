ALTER TABLE "projects" ADD COLUMN "goal" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "health" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "health_reason" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "health_updated_at" timestamp with time zone;