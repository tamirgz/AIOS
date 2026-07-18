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
    const tools = [...getToolsByNames(agent.tools), ...ledgerTools(ledger)];

    let finalText = "";
    let tokensIn = 0;
    let tokensOut = 0;
    let errored: string | null = null;

    for await (const event of provider.run({
      system: [
        `You are "${agent.name}", an autonomous background agent inside AIOS, the user's personal AI operating system.`,
        "You run unattended — do the work with your tools, then produce a concise final report of what you did and found.",
        "Idempotency: use ledger.has to check items before acting and ledger.mark after processing. Never redo work a previous run already did.",
        `Current date-time: ${new Date().toISOString()}`,
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

async function routeFor(agent: Agent) {
  if (agent.provider && agent.model) {
    return { provider: providers[agent.provider], model: agent.model };
  }
  const route = await resolveRoute(`agent:${agent.id}`);
  return { provider: route.provider, model: route.model };
}
