CREATE TABLE "external_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"reported_at" timestamp with time zone NOT NULL,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "external_reports_source" ON "external_reports" USING btree ("source");--> statement-breakpoint
CREATE INDEX "external_reports_reported" ON "external_reports" USING btree ("reported_at");