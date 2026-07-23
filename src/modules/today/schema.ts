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
 * The attention item — the single atom of the Life-OS loop (ONE-STOP §3.2).
 *
 * Everything a chief-of-staff agent surfaces is one of these: a typed,
 * project-anchored thing that wants the user's attention. The "Needs you"
 * queue and Plan-my-day are just different filters over these rows (plus the
 * pre-existing approvals + Workbench needs_input, which the queue aggregates
 * — we do NOT duplicate those here).
 */
export const ATTENTION_TYPES = [
  "notify", // FYI, no action needed
  "question", // needs a decision
  "review", // check my work / a draft
  "approve", // sign off before an action happens
  "do", // a suggested next action you can accept into the day
] as const;
export type AttentionType = (typeof ATTENTION_TYPES)[number];

export const ATTENTION_STATUSES = [
  "open",
  "snoozed",
  "done",
  "dismissed",
] as const;
export type AttentionStatus = (typeof ATTENTION_STATUSES)[number];

export const attentionItems = pgTable(
  "attention_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    type: text("type", { enum: ATTENTION_TYPES }).notNull().default("notify"),
    title: text("title").notNull(),
    /** Why it surfaced — one or two sentences. */
    body: text("body"),
    /** Anchored to a project ("projects:<uuid>") or null = personal. */
    projectRef: text("project_ref"),
    /** Who raised it: "agent:Daily planner", "system", "connector"… */
    source: text("source").notNull().default("system"),
    status: text("status", { enum: ATTENTION_STATUSES })
      .notNull()
      .default("open"),
    /** Higher = more urgent. Drives queue sort and day-slotting. */
    urgency: integer("urgency").notNull().default(0),
    dueAt: timestamp("due_at", { withTimezone: true }),
    snoozedUntil: timestamp("snoozed_until", { withTimezone: true }),
    /** Optional in-app link (a task, project, idea, workbench task…). */
    href: text("href"),
    /**
     * Type-specific extras: a proposed next-action string, a draft reply, a
     * diff ref — whatever the acting surface needs. Never a secret.
     */
    payload: jsonb("payload").notNull().default({}),
    /** Idempotency key so an agent re-run doesn't raise the same card twice. */
    dedupeKey: text("dedupe_key"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("attention_status").on(t.status, t.urgency),
    index("attention_project").on(t.projectRef),
    // One open card per dedupe key — the agent idempotency guarantee.
    index("attention_dedupe").on(t.dedupeKey),
  ],
);

export type AttentionItem = typeof attentionItems.$inferSelect;
