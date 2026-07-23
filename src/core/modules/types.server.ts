// Server-side module contract: components, DB schema, AI tools, agent
// templates. Imported only from server components and the agent worker —
// never from client components. (Enforced by convention, not the
// `server-only` package, because the worker runs under plain Node/tsx.)
import type { ComponentType } from "react";
import type { PgTable } from "drizzle-orm/pg-core";
import type { ZodType } from "zod";
import type { Db } from "@/core/db/client";

export interface AiToolContext {
  db: Db;
  /** Set when the tool is invoked from an agent run (not chat). */
  agentRunId?: string;
  /** Processed-items ledger, available to agent runs for idempotency. */
  ledger?: {
    has(itemKey: string): Promise<boolean>;
    mark(itemKey: string, result?: unknown): Promise<void>;
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface AiToolDef<I = any> {
  /** Namespaced: "<module>.<action>", e.g. "tasks.create". */
  name: string;
  description: string;
  input: ZodType<I>;
  execute(input: I, ctx: AiToolContext): Promise<unknown>;
  /**
   * "safe" (default): executes immediately everywhere.
   * "approval": in unattended AGENT runs the call is queued for the user to
   * approve (chat executes directly — the user is present).
   */
  risk?: "safe" | "approval";
}

export interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  defaultPrompt: string;
  /** Tool names from the global registry this template needs. */
  defaultTools: string[];
  /** Cron pattern, or null for manual-only. */
  defaultSchedule: string | null;
  /**
   * Optional provider/model this template must run on. Life-OS periodic agents
   * pin these to a FREE model (local ollama, or free-tier nvidia cloud) so the
   * heartbeat never bills — see ONE-STOP-PLAN §4. Omit to use agent.default.
   */
  defaultProvider?: "anthropic" | "ollama" | "nvidia";
  defaultModel?: string;
  /**
   * Local Ollama model to retry on if `defaultProvider` is a cloud provider and
   * it fails on connectivity — keeps the heartbeat alive offline / when the
   * cloud is rate-limited. Only meaningful with a cloud `defaultProvider`.
   */
  defaultFallbackModel?: string;
}

export interface ModuleWidget {
  id: string;
  title: string;
  size: "sm" | "md" | "lg";
  /** May be an async server component — rendered by the dashboard grid. */
  component: ComponentType;
}

export interface ModuleRouteProps {
  /** Path segments after /m/<module-id>/. */
  params: string[];
}

/**
 * Background job handler run by the worker process. The worker LISTENs on
 * `channel`; a NOTIFY with a payload invokes `handle`. Modules use this for
 * async pipelines (e.g. knowledge enrichment) without touching worker code.
 */
export interface ModuleJob {
  channel: string;
  handle(payload: string, ctx: AiToolContext): Promise<void>;
  /** Optional cron pattern — the worker also runs this job on a schedule (payload = ""). */
  schedule?: string;
}

export interface ModuleServerManifest {
  id: string;
  /** "" is the module root page; "[id]" matches a single dynamic segment. */
  routes: Record<string, ComponentType<ModuleRouteProps>>;
  widgets: ModuleWidget[];
  schema: Record<string, PgTable>;
  aiTools: AiToolDef[];
  agentTemplates: AgentTemplate[];
  jobs?: ModuleJob[];
}
