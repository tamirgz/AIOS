ALTER TABLE "agents" ADD COLUMN "success_tool" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "repo_digest" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "repo_digest_at" timestamp with time zone;