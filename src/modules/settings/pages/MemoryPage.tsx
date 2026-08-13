import { db } from "@/core/db/client";
import { listMemoryBlocks } from "@/core/memory";
import { MemoryEditor } from "../components/MemoryEditor";
import { SettingsNav } from "../components/SettingsNav";

/** Settings · Memory — dynamic blocks + the archival journal. */
export async function MemoryPage() {
  const memory = await listMemoryBlocks().catch(() => []);
  const { memoryEntries } = await import("@/core/db/schema/memory");
  const { desc: descOrder, sql: dsql } = await import("drizzle-orm");
  const [journal, [{ n: journalCount }]] = await Promise.all([
    db
      .select()
      .from(memoryEntries)
      .orderBy(descOrder(memoryEntries.createdAt))
      .limit(8)
      .catch(() => []),
    db
      .select({ n: dsql<number>`count(*)` })
      .from(memoryEntries)
      .catch(() => [{ n: 0 }]),
  ]);

  return (
    <div className="max-w-4xl">
      <SettingsNav />
      <MemoryEditor
        blocks={memory}
        journal={journal}
        journalCount={Number(journalCount)}
      />
    </div>
  );
}
