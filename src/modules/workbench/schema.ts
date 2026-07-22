import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Workbench — the one-off task surface.
 *
 * The shape is task → attempts → events, not task → transcript. A task is
 * "what I want done"; an attempt is one execution of it by one executor at
 * one model, on its own git branch. Retrying with a different agent is a
 * sibling attempt on the same card, which is also what makes best-of-N free.
 */
export const TASK_TYPES = [
  "research",
  "code",
  /** Same as `code`, but on a local executor + local model — free and private. */
  "code-local",
  "docs",
  "custom",
] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export const TASK_STATUSES = [
  "queued",
  "running",
  "needs_input",
  "review",
  "done",
  "failed",
  "cancelled",
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const ATTEMPT_STATUSES = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "timed_out",
  "cancelled",
] as const;
export type AttemptStatus = (typeof ATTEMPT_STATUSES)[number];

export const workbenchTasks = pgTable(
  "workbench_tasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: text("title").notNull(),
    prompt: text("prompt").notNull(),
    taskType: text("task_type", { enum: TASK_TYPES })
      .notNull()
      .default("research"),
    /** Absolute path of the repo for code tasks; null for everything else. */
    repoPath: text("repo_path"),
    status: text("status", { enum: TASK_STATUSES }).notNull().default("queued"),
    /** Entity-ref of whatever spawned this ("ideas:<uuid>", "chat"…). */
    createdFrom: text("created_from"),
    /** Headline of the finished work — what you read before the transcript. */
    summary: text("summary"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("workbench_tasks_status").on(t.status)],
);

export const taskAttempts = pgTable(
  "task_attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    taskId: uuid("task_id").notNull(),
    /** 1-based, so the UI can say "attempt 2 of 3" without counting. */
    seq: integer("seq").notNull().default(1),
    executorId: text("executor_id").notNull(),
    model: text("model"),
    status: text("status", { enum: ATTEMPT_STATUSES })
      .notNull()
      .default("queued"),
    /** Where the work happened — git worktree, or a scratch dir for research. */
    workdir: text("workdir"),
    branch: text("branch"),
    /** Commit the branch forked from — the left side of the review diff. */
    baseSha: text("base_sha"),
    pid: integer("pid"),
    exitCode: integer("exit_code"),
    error: text("error"),
    /** The executor's own last word (result event / final assistant text). */
    result: text("result"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    costUsd: text("cost_usd"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    /** Last event time — the stall detector, not a separate ping. */
    heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("task_attempts_task").on(t.taskId),
    index("task_attempts_status").on(t.status),
  ],
);

/**
 * One normalized event stream for every executor (per the OpenHands lesson):
 * the live tail, the stored log and any future replay all read these rows,
 * so adapters differ only in how they translate their own output into them.
 */
export const ATTEMPT_EVENT_TYPES = [
  "status",
  "text",
  "tool_call",
  "tool_result",
  "usage",
  "summary",
  "error",
  "result",
] as const;
export type AttemptEventType = (typeof ATTEMPT_EVENT_TYPES)[number];

export const attemptEvents = pgTable(
  "attempt_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    attemptId: uuid("attempt_id").notNull(),
    type: text("type", { enum: ATTEMPT_EVENT_TYPES }).notNull(),
    payload: jsonb("payload").notNull().default({}),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("attempt_events_attempt").on(t.attemptId, t.at)],
);

/**
 * Executors are configuration, not code paths: W1 seeds claude-headless and
 * native, and W2 adds opencode/pi/aider as rows against the generic adapter.
 */
export const EXECUTOR_KINDS = [
  "claude-headless",
  "native",
  "cli",
  "opencode-server",
] as const;
export type ExecutorKind = (typeof EXECUTOR_KINDS)[number];

export const executors = pgTable("executors", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  kind: text("kind", { enum: EXECUTOR_KINDS }).notNull(),
  /** For "cli": the command line, with {{prompt}} / {{workdir}} / {{model}}. */
  commandTemplate: text("command_template"),
  /** How to read the command's stdout: jsonl | pi-json | text. */
  parser: text("parser", { enum: ["jsonl", "pi-json", "text"] }),
  defaultModel: text("default_model"),
  /** "worktree" isolates the run on its own branch; "none" runs in place. */
  gitMode: text("git_mode", { enum: ["worktree", "none"] })
    .notNull()
    .default("none"),
  timeoutMs: integer("timeout_ms").notNull().default(900_000),
  enabled: text("enabled").notNull().default("true"),
});

export type WorkbenchTask = typeof workbenchTasks.$inferSelect;
export type TaskAttempt = typeof taskAttempts.$inferSelect;
export type AttemptEvent = typeof attemptEvents.$inferSelect;
export type Executor = typeof executors.$inferSelect;
