import { and, eq, sql as dsql } from "drizzle-orm";
import { z } from "zod";
import { db, sql } from "@/core/db/client";
import {
  agentLedger,
  agentRuns,
  agents,
  type Agent,
} from "@/core/db/schema/agents";
import type { AIEvent } from "@/core/ai/provider";
import { providers, resolveRoute } from "@/core/ai/routing";
import { getToolsByNames } from "@/core/ai/tool-registry";
import type { AiToolDef } from "@/core/modules/types.server";

const RUN_TIMEOUT_MS = 10 * 60 * 1000;
const HEARTBEAT_MS = 15 * 1000;

function ledgerFor(agentId: string, runId: string) {
  return {
    async has(itemKey: string) {
      const rows = await db
        .select({ id: agentLedger.id })
        .from(agentLedger)
        .where(
          and(
            eq(agentLedger.agentId, agentId),
            eq(agentLedger.itemKey, itemKey),
          ),
        )
        .limit(1);
      return rows.length > 0;
    },
    async mark(itemKey: string, result?: unknown) {
      await db
        .insert(agentLedger)
        .values({ agentId, itemKey, runId, result: result ?? null })
        .onConflictDoNothing();
    },
  };
}

/** Built-in idempotency tools injected into every agent run. */
function ledgerTools(ledger: ReturnType<typeof ledgerFor>): AiToolDef[] {
  return [
    {
      name: "ledger.has",
      description:
        "Check whether an item key was already processed in a previous run. Always check before acting on an item.",
      input: z.object({ itemKey: z.string().min(1) }),
      execute: async (i: { itemKey: string }) => ({
        processed: await ledger.has(i.itemKey),
      }),
    },
    {
      name: "ledger.mark",
      description:
        "Mark an item key as processed so future runs skip it. Include a short result summary.",
      input: z.object({
        itemKey: z.string().min(1),
        result: z.string().optional(),
      }),
      execute: async (i: { itemKey: string; result?: string }) => {
        await ledger.mark(i.itemKey, i.result);
        return { marked: i.itemKey };
      },
    },
  ];
}

async function patchRun(runId: string, patch: Record<string, unknown>) {
  await db.update(agentRuns).set(patch).where(eq(agentRuns.id, runId));
  await sql.notify("agent_runs", runId);
}

async function appendEvent(runId: string, event: AIEvent) {
  await db
    .update(agentRuns)
    .set({
      transcript: dsql`${agentRuns.transcript} || ${JSON.stringify([event])}::jsonb`,
      heartbeatAt: new Date(),
    })
    .where(eq(agentRuns.id, runId));
  await sql.notify("agent_runs", runId);
}

/** Insert a queued run; returns null if one is already live (unique index). */
export async function enqueueRun(
  agentId: string,
  trigger: "cron" | "manual",
): Promise<string | null> {
  try {
    const [row] = await db
      .insert(agentRuns)
      .values({ agentId, trigger, status: "queued" })
      .returning({ id: agentRuns.id });
    await sql.notify("agent_runs", row.id);
    return row.id;
  } catch {
    return null; // live run exists — skip (croner overrun / double click)
  }
}

export async function executeRun(runId: string): Promise<void> {
  const [run] = await db
    .select()
    .from(agentRuns)
    .where(eq(agentRuns.id, runId));
  if (!run || run.status !== "queued") return;

  const [agent] = await db
    .select()
    .from(agents)
    .where(eq(agents.id, run.agentId));
  if (!agent) {
    await patchRun(runId, {
      status: "failed",
      error: "agent not found",
      finishedAt: new Date(),
    });
    return;
  }

  await patchRun(runId, {
    status: "running",
    startedAt: new Date(),
    heartbeatAt: new Date(),
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RUN_TIMEOUT_MS);
  const heartbeat = setInterval(() => {
    db.update(agentRuns)
      .set({ heartbeatAt: new Date() })
      .where(eq(agentRuns.id, runId))
      .catch(() => {});
  }, HEARTBEAT_MS);

  try {
    const { provider, model } = await routeFor(agent);
    const ledger = ledgerFor(agent.id, runId);
    // ledger.* and memory.update are always available, like in chat.
    // Approval-tier tools are wrapped: unattended runs queue the call for the
    // user instead of executing it.
    const tools = [
      ...getToolsByNames([...agent.tools, "memory.update"]).map((t) =>
        t.risk === "approval" ? wrapWithApproval(t, agent, runId) : t,
      ),
      ...ledgerTools(ledger),
    ];

    let finalText = "";
    let tokensIn = 0;
    let tokensOut = 0;
    let errored: string | null = null;

    const { renderMemoryContext } = await import("@/core/memory");
    for await (const event of provider.run({
      system: [
        `You are "${agent.name}", an autonomous background agent inside AIOS, the user's personal AI operating system.`,
        "You run unattended — do the work with your tools, then produce a concise final report of what you did and found.",
        "Idempotency: use ledger.has to check items before acting and ledger.mark after processing. Never redo work a previous run already did.",
        `Current date-time: ${new Date().toISOString()}`,
        "",
        await renderMemoryContext(),
      ].join("\n"),
      messages: [{ role: "user", content: agent.prompt }],
      tools,
      toolCtx: { db, agentRunId: runId, ledger },
      model,
      signal: controller.signal,
    })) {
      await appendEvent(runId, event);
      if (event.type === "done") finalText = event.text;
      if (event.type === "error") errored = event.message;
      if (event.type === "usage") {
        tokensIn += event.inputTokens;
        tokensOut += event.outputTokens;
      }
    }

    if (errored) {
      await patchRun(runId, {
        status: controller.signal.aborted ? "timed_out" : "failed",
        error: errored,
        finishedAt: new Date(),
        tokensIn,
        tokensOut,
      });
    } else {
      await patchRun(runId, {
        status: "succeeded",
        result: finalText,
        finishedAt: new Date(),
        tokensIn,
        tokensOut,
      });
    }
  } catch (e) {
    await patchRun(runId, {
      status: controller.signal.aborted ? "timed_out" : "failed",
      error: String(e),
      finishedAt: new Date(),
    });
  } finally {
    clearTimeout(timeout);
    clearInterval(heartbeat);
  }
}

function wrapWithApproval(
  tool: AiToolDef,
  agent: Agent,
  runId: string,
): AiToolDef {
  return {
    ...tool,
    description: `${tool.description} NOTE: this action requires the user's approval — calling it queues the request; it executes only after the user approves.`,
    async execute(input) {
      const { approvals } = await import("@/core/db/schema/approvals");
      const { notify } = await import("@/core/notify");
      const [row] = await db
        .insert(approvals)
        .values({
          agentId: agent.id,
          runId,
          agentName: agent.name,
          toolName: tool.name,
          input,
        })
        .returning();
      await sql.notify("approvals_changed", row.id);
      await notify({
        title: `Approval needed: ${tool.name}`,
        body: `Agent "${agent.name}" wants to run ${tool.name} with:\n${JSON.stringify(input, null, 2).slice(0, 400)}`,
        level: "warn",
        source: `agent:${agent.name}`,
        href: "/m/agents",
      });
      return {
        pending_approval: row.id,
        note: "Queued for the user's approval; it will execute once approved. Mention this in your report.",
      };
    },
  };
}

/** Called by the worker when the user approves — executes the parked call. */
export async function executeApproval(approvalId: string): Promise<void> {
  const { approvals } = await import("@/core/db/schema/approvals");
  const { notify } = await import("@/core/notify");
  const [row] = await db
    .select()
    .from(approvals)
    .where(eq(approvals.id, approvalId));
  if (!row || row.status !== "approved") return;

  const tool = getToolsByNames([row.toolName])[0];
  const patch = async (p: Record<string, unknown>) => {
    await db.update(approvals).set(p).where(eq(approvals.id, approvalId));
    await sql.notify("approvals_changed", approvalId);
  };

  try {
    if (!tool) throw new Error(`tool ${row.toolName} no longer exists`);
    const input = tool.input.parse(row.input);
    const result = await tool.execute(input, { db });
    await patch({ status: "executed", result: result ?? null });
    await notify({
      title: `Approved & done: ${row.toolName}`,
      body: JSON.stringify(result ?? {}).slice(0, 300),
      level: "success",
      source: `agent:${row.agentName}`,
    });
  } catch (e) {
    await patch({ status: "failed", result: { error: String(e) } });
    await notify({
      title: `Approved action failed: ${row.toolName}`,
      body: String(e).slice(0, 300),
      level: "warn",
      source: `agent:${row.agentName}`,
    });
  }
}

async function routeFor(agent: Agent) {
  if (agent.provider && agent.model) {
    return { provider: providers[agent.provider], model: agent.model };
  }
  const route = await resolveRoute(`agent:${agent.id}`);
  return { provider: route.provider, model: route.model };
}
