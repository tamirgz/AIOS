CREATE TABLE "telegram_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"enabled" text DEFAULT 'true' NOT NULL,
	"criteria" text DEFAULT '' NOT NULL,
	"backfill_days" integer DEFAULT 14 NOT NULL,
	"last_seen_id" integer,
	"last_run_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "telegram_channels_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "telegram_posts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel" text NOT NULL,
	"post_id" integer NOT NULL,
	"posted_at" timestamp with time zone,
	"text" text DEFAULT '' NOT NULL,
	"urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"linked_text" text,
	"relevant" text,
	"relevance_why" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "telegram_posts_channel_post" UNIQUE("channel","post_id")
);
--> statement-breakpoint
CREATE INDEX "telegram_posts_channel" ON "telegram_posts" USING btree ("channel","post_id");