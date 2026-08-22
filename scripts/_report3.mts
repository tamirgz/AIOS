import { config } from "dotenv"; config({ path: ".env.local" });
import { db } from "@/core/db/client";
import { workbenchTasks, taskAttempts } from "@/modules/workbench/schema";
import { eq, desc } from "drizzle-orm";
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
let id="";
try { const { createInvestmentReport } = await import("@/modules/investments/report"); id=(await createInvestmentReport()).id; }
catch { const [t]=await db.select().from(workbenchTasks).orderBy(desc(workbenchTasks.createdAt)).limit(1); id=t.id; }
console.log("report task:", id);
let status="queued";
for(let i=0;i<240;i++){ await sleep(4000);
  const [t]=await db.select().from(workbenchTasks).where(eq(workbenchTasks.id,id));
  status=t.status; if(["done","failed","cancelled","review"].includes(status)) break; }
const [a]=await db.select().from(taskAttempts).where(eq(taskAttempts.taskId,id)).orderBy(desc(taskAttempts.seq)).limit(1);
const rep=a?.result ?? "";
const charts=(rep.match(/\/api\/charts\/[a-f0-9-]+/g)||[]).length;
const headings=(rep.match(/^##/gm)||[]);
const real=/\bMU\b|\bDHR\b|\bSTLD\b|\bELAL\.TA\b|\bJXN\b|\bSPMO\b/.test(rep);
console.log(`\nstatus=${status} | err=${a?.error?.slice(0,90)||'-'} | ${rep.length} chars | headings=${headings.length} | charts=${charts} | grounded=${real}`);
console.log("headings:", headings.join(" | "));
console.log("\n=== REPORT (first 1500) ===\n"+rep.slice(0,1500));
process.exit(0);
