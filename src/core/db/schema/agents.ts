import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { AI_PROVIDERS } from "./ai-routes";

export const AGENT_TRIGGERS = ["cron", "manual"] as const;
export const RUN_STATUSES = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "timed_out",
] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const agents = pgTable("agents", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  prompt: text("prompt").notNull(),
  /** Allowlist of tool names from the registry ("tasks.list", …). */
  tools: jsonb("tools").$type<string[]>().notNull().default([]),
  /** Cron pattern; null = manual-only. */
  schedule: text("schedule"),
  enabled: boolean("enabled").notNull().default(true),
  /** Optional per-agent provider/model override (else agent.default route). */
  provider: text("provider", { enum: AI_PROVIDERS }),
  model: text("model"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: uuid("agent_id").notNull(),
    status: text("status", { enum: RUN_STATUSES }).notNull().default("queued"),
    trigger: text("trigger", { enum: AGENT_TRIGGERS }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
    /** Append-only AIEvent list. */
    transcript: jsonb("transcript").$type<unknown[]>().notNull().default([]),
    result: text("result"),
    error: text("error"),
    tokensIn: integer("tokens_in").notNull().default(0),
    tokensOut: integer("tokens_out").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // DB-level concurrency guard: one live run per agent.
    uniqueIndex("agent_runs_one_live")
      .on(t.agentId)
      .where(sql`${t.status} in ('queued', 'running')`),
    index("agent_runs_agent_created").on(t.agentId, t.createdAt),
  ],
);

/** Processed-items manifest — scheduled runs must be idempotent. */
export const agentLedger = pgTable(
  "agent_ledger",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: uuid("agent_id").notNull(),
    itemKey: text("item_key").notNull(),
    runId: uuid("run_id"),
    result: jsonb("result"),
    processedAt: timestamp("processed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("agent_ledger_unique_item").on(t.agentId, t.itemKey)],
);

export type Agent = typeof agents.$inferSelect;
export type AgentRun = typeof agentRuns.$inferSelect;
