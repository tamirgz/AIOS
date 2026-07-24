CREATE TABLE "notion_pages" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text DEFAULT '(untitled)' NOT NULL,
	"url" text,
	"content" text,
	"embedding" vector,
	"last_edited" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
