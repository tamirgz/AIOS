import { config } from "dotenv"; config({ path: ".env.local" });
import { db, sql } from "@/core/db/client";
import { telegramChannels } from "@/modules/telegram/schema";
import { ingestChannel } from "@/modules/telegram/ingest";
const CRITERIA="Malicious links/URLs, phishing, smishing, QR-code attacks, malicious PDF/office/archive files, CDR, browser link threats — NoClick's domain.";
async function main(){
  const [ch]=await db.insert(telegramChannels).values({username:"RedXCyberSecurity",criteria:CRITERIA,backfillDays:1}).onConflictDoNothing().returning();
  const rows = await db.select().from(telegramChannels);
  const id = ch?.id ?? rows[0].id;
  await ingestChannel(id);
  console.log("INGEST DONE");
  await sql.end();
}
main().catch(async e=>{console.error("ERR",String(e).slice(0,200)); process.exit(1);});
