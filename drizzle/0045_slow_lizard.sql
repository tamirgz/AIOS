ALTER TABLE "search_index" ADD COLUMN "embed_text" text;--> statement-breakpoint
ALTER TABLE "memory_entries" DROP COLUMN "embedding";--> statement-breakpoint
ALTER TABLE "ideas" DROP COLUMN "embedding";--> statement-breakpoint
ALTER TABLE "knowledge_items" DROP COLUMN "embedding";--> statement-breakpoint
ALTER TABLE "notes" DROP COLUMN "embedding";--> statement-breakpoint
ALTER TABLE "notion_pages" DROP COLUMN "embedding";--> statement-breakpoint
ALTER TABLE "obsidian_notes" DROP COLUMN "embedding";--> statement-breakpoint
ALTER TABLE "project_files" DROP COLUMN "embedding";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "embedding";--> statement-breakpoint
ALTER TABLE "tasks" DROP COLUMN "embedding";--> statement-breakpoint
ALTER TABLE "attention_items" DROP COLUMN "embedding";