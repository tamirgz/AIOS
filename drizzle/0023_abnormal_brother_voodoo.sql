CREATE TABLE "project_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"mime_type" text,
	"size_bytes" integer NOT NULL,
	"content" "bytea" NOT NULL,
	"extracted_text" text,
	"status" text DEFAULT 'processing' NOT NULL,
	"status_detail" text,
	"embedding" vector,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "project_files_project" ON "project_files" USING btree ("project_id");