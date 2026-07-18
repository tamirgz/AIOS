/**
 * AIOS agent worker — runs on the host (needs Claude CLI credentials + Ollama).
 * Responsibilities: cron-schedule agents, execute runs, orphan recovery,
 * module background jobs. Postgres LISTEN/NOTIFY is the message bus.
 *
 * Start with: pnpm worker
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { Cron } from "croner";
import { and, eq, inArray, lt } from "drizzle-orm";
import postgres from "postgres";
import { db } from "@/core/db/client";
import { agentRuns, agents, type Agent } from "@/core/db/schema/agents";
import { notifications } from "@/core/db/schema/notifications";
import { getSetting, SETTING_KEYS } from "@/core/app-settings";
import { serverModules } from "@/modules/registry.server";
import { enqueueRun, executeApproval, executeRun } from "./executor";

async function deliverToSlack(notificationId: string) {
  const webhook = await getSetting(SETTING_KEYS.slackWebhookUrl);
  if (!webhook) return;
  const [n] = await db
    .select()
    .from(notifications)
    .where(eq(notifications.id, notificationId));
  if (!n) return;
  const res = await fetch(webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: `*AIOS · ${n.title}*${n.body ? `\n${n.body}` : ""}`,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`slack webhook → ${res.status}`);
  log(`notification ${notificationId} delivered to Slack`);
}

const ADVISORY_LOCK_KEY = 0x41494f53; // "AIOS"
const ORPHAN_AFTER_MS = 60 * 1000;

const url =
  process.env.DATABASE_URL ?? "postgres://aios:aios@localhost:5544/aios";

const log = (msg: string) =>
  console.log(`[worker ${new Date().toISOString()}] ${msg}`);

const crons = new Map<string, Cron>();

async function syncSchedules() {
  const rows = await db.select().from(agents).where(eq(agents.enabled, true));
  const wanted = new Map(
    rows.filter((a) => a.schedule).map((a) => [a.id, a as Agent]),
  );

  for (const [id, cron] of crons) {
    const agent = wanted.get(id);
    if (!agent || agent.schedule !== cron.getPattern()) {
      cron.stop();
      crons.delete(id);
      log(`unscheduled agent ${id}`);
    }
  }

  for (const [id, agent] of wanted) {
    if (crons.has(id)) continue;
    try {
      const cron = new Cron(agent.schedule!, { protect: true }, async () => {
        const runId = await enqueueRun(id, "cron");
        if (runId) {
          log(`cron fired → run ${runId} (${agent.name})`);
          await executeRun(runId);
        } else {
          log(`cron fired but a live run exists — skipped (${agent.name})`);
        }
      });
      crons.set(id, cron);
      log(`scheduled "${agent.name}" [${agent.schedule}]`);
    } catch (e) {
      log(`invalid cron for "${agent.name}": ${e}`);
    }
  }
}

async function sweepOrphans() {
  const cutoff = new Date(Date.now() - ORPHAN_AFTER_MS);
  const orphaned = await db
    .update(agentRuns)
    .set({
      status: "failed",
      error: "orphaned (worker restarted or crashed mid-run)",
      finishedAt: new Date(),
    })
    .where(
      and(
        inArray(agentRuns.status, ["running", "queued"]),
        lt(agentRuns.heartbeatAt, cutoff),
      ),
    )
    .returning({ id: agentRuns.id });
  if (orphaned.length) log(`orphan sweep: failed ${orphaned.length} run(s)`);
}

async function main() {
  // Single-runner guarantee via advisory lock on a dedicated connection.
  const lockConn = postgres(url, { max: 1 });
  const [{ locked }] = await lockConn`
    select pg_try_advisory_lock(${ADVISORY_LOCK_KEY}) as locked`;
  if (!locked) {
    console.error(
      "[worker] another worker instance holds the lock — exiting.",
    );
    process.exit(1);
  }
  log("advisory lock acquired — single runner confirmed");

  await sweepOrphans();
  await syncSchedules();

  // Module background jobs (e.g. knowledge ingestion, calendar sync).
  const moduleJobs = serverModules.flatMap((m) => m.jobs ?? []);
  const jobHandlers = new Map(
    moduleJobs.map((j) => [j.channel, j.handle] as const),
  );
  for (const job of moduleJobs) {
    if (!job.schedule) continue;
    new Cron(job.schedule, { protect: true }, () => {
      job.handle("", { db }).catch((e) =>
        log(`scheduled job ${job.channel} failed: ${e}`),
      );
    });
    log(`job "${job.channel}" scheduled [${job.schedule}]`);
  }

  // Dedicated LISTEN connection.
  const listener = postgres(url, { max: 1 });
  await listener.listen("agents_changed", () => {
    log("agents_changed → resyncing schedules");
    syncSchedules().catch((e) => log(`resync failed: ${e}`));
  });
  await listener.listen("run_requests", (runId) => {
    log(`run request → ${runId}`);
    executeRun(runId).catch((e) => log(`run ${runId} failed: ${e}`));
  });
  await listener.listen("approval_decisions", (approvalId) => {
    log(`approval decision → ${approvalId}`);
    executeApproval(approvalId).catch((e) =>
      log(`approval ${approvalId} failed: ${e}`),
    );
  });
  await listener.listen("config_changed", (key) => {
    log(`config_changed → ${key} (routes re-read per run; noted)`);
  });
  // Slack delivery of notifications (skipped gracefully when unconfigured).
  await listener.listen("notifications", (id) => {
    if (!id || id === "read") return;
    deliverToSlack(id).catch((e) => log(`slack delivery failed: ${e}`));
  });
  for (const [channel, handle] of jobHandlers) {
    await listener.listen(channel, (payload) => {
      log(`job ${channel} ← ${payload}`);
      handle(payload, { db }).catch((e) =>
        log(`job ${channel} failed: ${e}`),
      );
    });
    log(`listening for module jobs on "${channel}"`);
  }

  // Periodic safety net: orphan sweep + schedule resync every 5 minutes.
  new Cron("*/5 * * * *", () => {
    sweepOrphans().catch(() => {});
    syncSchedules().catch(() => {});
  });

  // Embedding sweep: local nomic-embed-text via Ollama, rows with NULL
  // embeddings only — idempotent, free, offline.
  new Cron("*/2 * * * *", { protect: true }, async () => {
    try {
      const { sweepEmbeddings } = await import("@/core/embeddings");
      const n = await sweepEmbeddings();
      if (n > 0) log(`embedded ${n} row(s)`);
    } catch (e) {
      log(`embedding sweep failed (ollama down?): ${String(e).slice(0, 120)}`);
    }
  });

  // Catch up: execute any queued runs left from before boot.
  const queued = await db
    .select({ id: agentRuns.id })
    .from(agentRuns)
    .where(eq(agentRuns.status, "queued"));
  for (const q of queued) {
    log(`resuming queued run ${q.id}`);
    executeRun(q.id).catch((e) => log(`run ${q.id} failed: ${e}`));
  }

  log(
    `ready — ${crons.size} scheduled agent(s), ${jobHandlers.size} job channel(s)`,
  );
}

main().catch((e) => {
  console.error("[worker] fatal:", e);
  process.exit(1);
});
