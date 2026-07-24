CREATE TABLE "gmail_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"thread_id" text,
	"from_name" text,
	"from_email" text,
	"subject" text,
	"snippet" text,
	"received_at" timestamp with time zone,
	"unread" boolean DEFAULT false NOT NULL,
	"labels" text[],
	"link" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "gmail_received" ON "gmail_messages" USING btree ("received_at");