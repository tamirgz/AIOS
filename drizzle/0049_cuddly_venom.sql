CREATE TABLE "charts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text,
	"svg" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
