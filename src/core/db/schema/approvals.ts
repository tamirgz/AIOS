import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const APPROVAL_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "executed",
  "failed",
] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

/**
 * Human-in-the-loop queue: agent runs that call an approval-tier tool park the
 * call here instead of executing. Approving hands it to the worker to execute.
 */
export const approvals = pgTable(
  "approvals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    agentId: uuid("agent_id").notNull(),
    runId: uuid("run_id").notNull(),
    agentName: text("agent_name").notNull(),
    toolName: text("tool_name").notNull(),
    input: jsonb("input").notNull(),
    status: text("status", { enum: APPROVAL_STATUSES })
      .notNull()
      .default("pending"),
    result: jsonb("result"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (t) => [index("approvals_status_created").on(t.status, t.createdAt)],
);

export type Approval = typeof approvals.$inferSelect;
