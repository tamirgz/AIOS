ALTER TABLE "routines" ADD COLUMN "gate_enabled" text DEFAULT 'true' NOT NULL;--> statement-breakpoint
ALTER TABLE "routines" ADD COLUMN "gate_model" text;--> statement-breakpoint
ALTER TABLE "routines" ADD COLUMN "last_gate_relevant" text;--> statement-breakpoint
ALTER TABLE "routines" ADD COLUMN "last_gate_why" text;--> statement-breakpoint
ALTER TABLE "routines" ADD COLUMN "gate_skipped" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "routines" ADD COLUMN "gate_ran" integer DEFAULT 0 NOT NULL;