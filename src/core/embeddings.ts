import { isNull, sql as dsql } from "drizzle-orm";
import { db } from "@/core/db/client";
import { notes } from "@/modules/notes/schema";
import { knowledgeItems } from "@/modules/knowledge/schema";
import { tasks } from "@/modules/tasks/schema";

const OLLAMA_BASE = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
const MODEL = "nomic-embed-text";
export const EMBEDDING_DIMS = 768;

export async function embedText(text: string): Promise<number[]> {
  const res = await fetch(`${OLLAMA_BASE}/api/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODEL, prompt: text.slice(0, 8000) }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`ollama embeddings → ${res.status}`);
  const data = (await res.json()) as { embedding: number[] };
  return data.embedding;
}

const toVec = (e: number[]) => `[${e.join(",")}]`;

/**
 * Background sweep (worker, every 2 min): embed any row that doesn't have an
 * embedding yet. Idempotent by construction — only touches NULL embeddings.
 * Local model via Ollama: free, offline, no tokens.
 */
export async function sweepEmbeddings(): Promise<number> {
  let done = 0;

  const noteRows = await db
    .select({ id: notes.id, title: notes.title, body: notes.body })
    .from(notes)
    .where(isNull(notes.embedding))
    .limit(20);
  for (const n of noteRows) {
    const e = await embedText(`${n.title}\n${n.body}`);
    await db
      .update(notes)
      .set({ embedding: dsql`${toVec(e)}::vector` })
      .where(dsql`${notes.id} = ${n.id}`);
    done++;
  }

  const kRows = await db
    .select()
    .from(knowledgeItems)
    .where(
      dsql`${knowledgeItems.embedding} is null and ${knowledgeItems.status} = 'ready'`,
    )
    .limit(20);
  for (const k of kRows) {
    const text = [k.title, k.note, k.insight?.summary, k.insight?.keyIdeas?.join("\n"), k.insight?.tags?.join(" ")]
      .filter(Boolean)
      .join("\n");
    const e = await embedText(text || k.input);
    await db
      .update(knowledgeItems)
      .set({ embedding: dsql`${toVec(e)}::vector` })
      .where(dsql`${knowledgeItems.id} = ${k.id}`);
    done++;
  }

  const taskRows = await db
    .select({ id: tasks.id, title: tasks.title, notes: tasks.notes })
    .from(tasks)
    .where(isNull(tasks.embedding))
    .limit(20);
  for (const t of taskRows) {
    const e = await embedText(`${t.title}\n${t.notes ?? ""}`);
    await db
      .update(tasks)
      .set({ embedding: dsql`${toVec(e)}::vector` })
      .where(dsql`${tasks.id} = ${t.id}`);
    done++;
  }

  return done;
}

export interface SemanticHit {
  kind: "note" | "knowledge" | "task";
  id: string;
  title: string;
  snippet: string | null;
  href: string;
  distance: number;
}

/** Hybrid-lite semantic search across notes, knowledge, and tasks. */
export async function searchEverything(
  query: string,
  limit = 8,
): Promise<SemanticHit[]> {
  const vec = toVec(await embedText(query));
  const rows = await db.execute<{
    kind: string;
    id: string;
    title: string;
    snippet: string | null;
    distance: number;
  }>(dsql`
    (select 'note' as kind, id::text, title, left(body, 160) as snippet,
            (embedding <=> ${vec}::vector) as distance
       from notes where embedding is not null)
    union all
    (select 'knowledge', id::text, coalesce(title, left(input, 80)),
            (insight->>'summary'), (embedding <=> ${vec}::vector)
       from knowledge_items where embedding is not null)
    union all
    (select 'task', id::text, title, null,
            (embedding <=> ${vec}::vector)
       from tasks where embedding is not null)
    order by distance asc
    limit ${limit}
  `);
  return [...rows].map((r) => ({
    kind: r.kind as SemanticHit["kind"],
    id: r.id,
    title: r.title,
    snippet: r.snippet,
    href:
      r.kind === "note"
        ? `/m/notes/${r.id}`
        : r.kind === "knowledge"
          ? `/m/knowledge/${r.id}`
          : "/m/tasks",
    distance: Number(r.distance),
  }));
}

/** Nearest neighbours of an existing item (for "related" panels). */
export async function relatedTo(
  kind: "note" | "knowledge",
  id: string,
  limit = 5,
): Promise<SemanticHit[]> {
  const table = kind === "note" ? "notes" : "knowledge_items";
  const rows = await db.execute<{
    kind: string;
    id: string;
    title: string;
    snippet: string | null;
    distance: number;
  }>(dsql`
    with target as (select embedding from ${dsql.raw(table)} where id = ${id} and embedding is not null)
    (select 'note' as kind, n.id::text, n.title, left(n.body, 160) as snippet,
            (n.embedding <=> (select embedding from target)) as distance
       from notes n where n.embedding is not null and not (n.id::text = ${id}))
    union all
    (select 'knowledge', k.id::text, coalesce(k.title, left(k.input, 80)),
            (k.insight->>'summary'), (k.embedding <=> (select embedding from target))
       from knowledge_items k where k.embedding is not null and not (k.id::text = ${id}))
    order by distance asc
    limit ${limit}
  `);
  return [...rows].map((r) => ({
    kind: r.kind as SemanticHit["kind"],
    id: r.id,
    title: r.title,
    snippet: r.snippet,
    href: r.kind === "note" ? `/m/notes/${r.id}` : `/m/knowledge/${r.id}`,
    distance: Number(r.distance),
  }));
}
