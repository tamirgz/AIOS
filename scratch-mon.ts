import { config } from "dotenv"; config({ path: ".env.local" });
import { desc, eq } from "drizzle-orm";
import { db, sql } from "@/core/db/client";
import { workbenchTasks, taskAttempts } from "@/modules/workbench/schema";
import { approvals } from "@/core/db/schema/approvals";
const RID = "657d7e72-32d8-4106-bd44-a2e4046ac0fd";
async function snap(){
  const [t] = await db.select().from(workbenchTasks).where(eq(workbenchTasks.createdFrom, `routines:${RID}`)).orderBy(desc(workbenchTasks.createdAt)).limit(1);
  if (!t) return "no task yet";
  const [a] = await db.select().from(taskAttempts).where(eq(taskAttempts.taskId, t.id)).orderBy(desc(taskAttempts.seq)).limit(1);
  const appr = await db.select().from(approvals).where(eq(approvals.runId, t.id));
  return `task=${t.id.slice(0,8)} status=${t.status} judge=${t.judgeStatus ?? "-"} attempt=${a?.status}/${a?.seq} | ${(t.summary??"").slice(0,110).replace(/\n/g," ")}${appr.length?" || PR-approval:"+appr[0].status:""}`;
}
async function main(){ console.log(new Date().toISOString().slice(11,19), await snap()); await sql.end(); }
main();
