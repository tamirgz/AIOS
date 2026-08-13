ALTER TABLE "task_attempts" ADD COLUMN "feedback" text;--> statement-breakpoint
ALTER TABLE "task_attempts" ADD COLUMN "judge_verdict" jsonb;--> statement-breakpoint
ALTER TABLE "workbench_tasks" ADD COLUMN "judge_status" text;--> statement-breakpoint
ALTER TABLE "workbench_tasks" ADD COLUMN "judge_verdict" jsonb;