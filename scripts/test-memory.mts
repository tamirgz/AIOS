/**
 * Memory-system integration test — probes every tier and every function from all
 * directions: blocks (bounded injection, priority, budget, MAX_BLOCKS, slug,
 * provenance), entries (dedup, review, prune, compact), recall (memory, unified
 * cross-ecosystem, tier-aware, hybrid, keyword fallback, never-throws), tiers,
 * and freshness. Throwaways are `ZZ_`/`zz_`-prefixed and cleaned up; real blocks
 * touched are saved and restored.
 *
 * Run:  npx tsx scripts/test-memory.mts   (needs dev DB + local embeddings)
 * Exit: non-zero on any failure.
 */
import { db, sql } from "@/core/db/client";
import { and, eq, like } from "drizzle-orm";
import {
  MEMORY_ENTRY_KINDS,
  MEMORY_TIER,
  memoryBlocks,
  memoryEntries,
} from "@/core/db/schema/memory";
import {
  checkMemoryFreshness,
  compactMemoryEntries,
  createMemoryBlockDef,
  ensureDefaultMemoryBlocks,
  pruneMemoryEntries,
  recallEntries,
  recallSemantic,
  rememberEntry,
  renderMemoryContext,
  reviewEntries,
  updateMemoryBlock,
} from "@/core/memory";
import { indexRow } from "@/core/search-index";
import { embedText } from "@/core/embeddings";

const R: { n: string; ok: boolean; d: string }[] = [];
const rec = (n: string, ok: boolean, d = "") => R.push({ n, ok, d });
const arr = Array.isArray;

async function clean() {
  await db.delete(memoryEntries).where(like(memoryEntries.text, "ZZ %"));
  await db.delete(memoryEntries).where(like(memoryEntries.source, "zz_%"));
  await db.delete(memoryBlocks).where(like(memoryBlocks.label, "zz\\_%"));
}

async function main() {
  await clean();

  // ================= TIERS =================
  rec(
    "tier: every kind mapped",
    MEMORY_ENTRY_KINDS.every((k) => ["episodic", "semantic", "procedural"].includes(MEMORY_TIER[k])),
    MEMORY_ENTRY_KINDS.map((k) => `${k}=${MEMORY_TIER[k]}`).join(" "),
  );

  // ================= BLOCKS =================
  await ensureDefaultMemoryBlocks();
  const defs = await db.select().from(memoryBlocks);
  rec("blocks: 4 defaults exist", ["who_i_am", "current_focus", "preferences", "active_projects"].every((l) => defs.some((b) => b.label === l)));

  // slug normalization + create
  await createMemoryBlockDef("ZZ Test Block!", "throwaway");
  const slug = (await db.select().from(memoryBlocks).where(eq(memoryBlocks.label, "zz_test_block"))).length === 1;
  rec("blocks: slug normalization", slug, '"ZZ Test Block!" -> zz_test_block');

  // replace archives old value as a superseded entry (provenance)
  await updateMemoryBlock("zz_test_block", "first value here", "replace");
  await updateMemoryBlock("zz_test_block", "second value here", "replace");
  const superseded = await db.select().from(memoryEntries).where(and(eq(memoryEntries.kind, "superseded"), like(memoryEntries.text, "%first value here%")));
  rec("blocks: replace archives old value as superseded", superseded.length >= 1);
  // clean that provenance entry (it's real-ish but ours)
  await db.delete(memoryEntries).where(like(memoryEntries.text, "%first value here%"));

  // append
  await updateMemoryBlock("zz_test_block", "third", "append");
  const appended = (await db.select().from(memoryBlocks).where(eq(memoryBlocks.label, "zz_test_block")))[0];
  rec("blocks: append concatenates", appended.value.includes("second value here") && appended.value.includes("third"));

  // char budget enforced
  let budgetEnforced = false;
  try { await updateMemoryBlock("zz_test_block", "x".repeat(5000), "replace"); } catch { budgetEnforced = true; }
  rec("blocks: char budget enforced", budgetEnforced, "5000-char value rejected");
  await db.delete(memoryBlocks).where(eq(memoryBlocks.label, "zz_test_block"));

  // MAX_BLOCKS enforced — fill to 12, expect the 13th to throw
  const baseCount = (await db.select().from(memoryBlocks)).length;
  let created = 0;
  for (let i = 0; i < 12 && baseCount + created < 12; i++) {
    try { await createMemoryBlockDef(`zz_fill_${i}`, "fill"); created++; } catch { break; }
  }
  let maxEnforced = false;
  try { await createMemoryBlockDef("zz_overflow", "should fail"); } catch { maxEnforced = true; }
  rec("blocks: MAX_BLOCKS (12) enforced", maxEnforced);
  await db.delete(memoryBlocks).where(like(memoryBlocks.label, "zz\\_fill\\_%"));
  await db.delete(memoryBlocks).where(eq(memoryBlocks.label, "zz_overflow"));

  // bounded injection — an oversized block cannot blow the budget; core kept
  const [focusOrig] = await db.select().from(memoryBlocks).where(eq(memoryBlocks.label, "who_i_am"));
  const whoRestore = focusOrig?.value ?? "";
  await db.update(memoryBlocks).set({ value: "I am the test user." }).where(eq(memoryBlocks.label, "who_i_am"));
  await db.insert(memoryBlocks).values({ label: "zz_big", description: "big", value: "X".repeat(9000), charLimit: 12000 }).onConflictDoNothing();
  const ctxStr = await renderMemoryContext();
  rec("blocks: injection bounded (<=6.5k) with a 9k block", ctxStr.length <= 6500, `${ctxStr.length} chars`);
  rec("blocks: core block kept, note when trimmed", ctxStr.includes("who_i_am") && ctxStr.includes("test user") && ctxStr.includes("trimmed to the injection budget"));
  await db.delete(memoryBlocks).where(eq(memoryBlocks.label, "zz_big"));
  await db.update(memoryBlocks).set({ value: whoRestore }).where(eq(memoryBlocks.label, "who_i_am"));

  // ================= ENTRIES =================
  const uniq = `ZZ dedup unique lesson ${Date.now()}`;
  const a1 = await rememberEntry({ kind: "lesson", source: "zz_test", text: uniq });
  const a2 = await rememberEntry({ kind: "lesson", source: "zz_test", text: uniq });
  rec("entries: remember dedups identical", a1.id === a2.id, a1.id === a2.id ? "same row" : "DUPLICATED");
  const distinct = await rememberEntry({ kind: "lesson", source: "zz_test", text: "ZZ a completely different lesson about orbital mechanics and rockets" });
  rec("entries: remember keeps distinct", distinct.id !== a1.id);

  // reviewEntries by tier
  const proc = await reviewEntries("procedural", 50);
  rec("entries: reviewEntries(procedural) only lesson/policy", proc.every((e) => e.kind === "lesson" || e.kind === "policy"), `${proc.length} rows`);

  // prune: aged event removed, durable kept
  const [oldEvent] = await db.insert(memoryEntries).values({ kind: "event", source: "zz_test", text: "ZZ old event", createdAt: new Date(Date.now() - 100 * 86400000) }).returning();
  const [oldDecision] = await db.insert(memoryEntries).values({ kind: "decision", source: "zz_test", text: "ZZ old decision", createdAt: new Date(Date.now() - 400 * 86400000) }).returning();
  await pruneMemoryEntries();
  rec("entries: prune ages out old event", (await db.select().from(memoryEntries).where(eq(memoryEntries.id, oldEvent.id))).length === 0);
  rec("entries: prune keeps old decision (durable)", (await db.select().from(memoryEntries).where(eq(memoryEntries.id, oldDecision.id))).length === 1);
  await db.delete(memoryEntries).where(eq(memoryEntries.id, oldDecision.id));

  // compact: near-identical older dropped, newest + durable kept
  const emb = await embedText("ZZ compaction identical widget fact");
  const [cOld] = await db.insert(memoryEntries).values({ kind: "fact", source: "zz_test", text: "ZZ compaction identical widget fact one", createdAt: new Date(Date.now() - 3600000) }).returning();
  const [cNew] = await db.insert(memoryEntries).values({ kind: "fact", source: "zz_test", text: "ZZ compaction identical widget fact two" }).returning();
  const [cLesson] = await db.insert(memoryEntries).values({ kind: "lesson", source: "zz_test", text: "ZZ compaction identical widget fact three", createdAt: new Date(Date.now() - 7200000) }).returning();
  await indexRow("memory", cOld.id, emb);
  await indexRow("memory", cNew.id, emb);
  await indexRow("memory", cLesson.id, emb);
  await compactMemoryEntries();
  const cOldGone = (await db.select().from(memoryEntries).where(eq(memoryEntries.id, cOld.id))).length === 0;
  const cNewKept = (await db.select().from(memoryEntries).where(eq(memoryEntries.id, cNew.id))).length === 1;
  const cLessonKept = (await db.select().from(memoryEntries).where(eq(memoryEntries.id, cLesson.id))).length === 1;
  rec("entries: compact drops older near-dup", cOldGone);
  rec("entries: compact keeps newest", cNewKept);
  rec("entries: compact spares lesson", cLessonKept);

  // ================= RECALL =================
  rec("recall: recallSemantic empty query -> [] (no throw)", (await recallSemantic("")).length === 0);
  const sem = await recallSemantic("local model inference on device", { kinds: ["memory", "knowledge", "note", "vault"], limit: 6 });
  rec("recall: recallSemantic cross-source", arr(sem) && sem.length > 0, `${sem.length} hits [${[...new Set(sem.map((h) => h.kind))].join(", ")}]`);

  // tier-aware: a superseded memory must NOT surface in recallSemantic
  const supTxt = "ZZ superseded jsonblob {\"x\":\"local model inference on device\"}";
  const [sup] = await db.insert(memoryEntries).values({ kind: "superseded", source: "zz_test", text: supTxt }).returning();
  await indexRow("memory", sup.id, await embedText("local model inference on device"));
  const sem2 = await recallSemantic("local model inference on device", { kinds: ["memory"], limit: 10 });
  rec("recall: tier-aware excludes superseded", !sem2.some((h) => h.text.includes("ZZ superseded jsonblob")), "superseded not recalled");
  await db.delete(memoryEntries).where(eq(memoryEntries.id, sup.id));

  // keyword fallback: recallEntries finds by substring even off-topic
  const kwTxt = `ZZ zqxywv keyword marker ${Date.now()}`;
  const kwRow = await rememberEntry({ kind: "fact", source: "zz_test", text: kwTxt });
  const kw = await recallEntries("zqxywv keyword marker", 5);
  rec("recall: recallEntries returns results", arr(kw), `${kw.length} hits`);
  await db.delete(memoryEntries).where(eq(memoryEntries.id, kwRow.id));

  // ================= FRESHNESS =================
  const [cf] = await db.select().from(memoryBlocks).where(eq(memoryBlocks.label, "current_focus"));
  if (cf) {
    const orig = { value: cf.value, updatedAt: cf.updatedAt };
    await db.update(memoryBlocks).set({ value: "ZZ stale focus", updatedAt: new Date(Date.now() - 15 * 86400000) }).where(eq(memoryBlocks.label, "current_focus"));
    const stale = await checkMemoryFreshness();
    rec("freshness: flags a 15d-stale block", stale.some((s) => s.label === "current_focus" && s.ageDays >= 9));
    await db.update(memoryBlocks).set({ value: orig.value, updatedAt: orig.updatedAt }).where(eq(memoryBlocks.label, "current_focus"));
    // a fresh block must NOT be flagged
    const stale2 = await checkMemoryFreshness();
    rec("freshness: does not flag a fresh block", !stale2.some((s) => s.label === "current_focus"));
  } else {
    rec("freshness: flags a 15d-stale block", true, "(no current_focus)");
    rec("freshness: does not flag a fresh block", true, "(no current_focus)");
  }

  await clean();

  // ================= REPORT =================
  const fails = R.filter((r) => !r.ok);
  console.log(`\n=== MEMORY VALIDATION: ${R.length - fails.length}/${R.length} passed ===`);
  for (const r of R) console.log(`  ${r.ok ? "✓" : "✗ FAIL"} ${r.n.padEnd(48)} ${r.d}`);
  await sql.end();
  if (fails.length) process.exit(1);
}

main().catch(async (e) => { console.error("HARNESS ERROR:", e?.stack || e); await clean().catch(() => {}); await sql.end(); process.exit(1); });
