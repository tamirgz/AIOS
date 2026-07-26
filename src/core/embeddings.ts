import { isNull, sql as dsql } from "drizzle-orm";
import { db, sql } from "@/core/db/client";
import { notes } from "@/modules/notes/schema";
import { knowledgeItems } from "@/modules/knowledge/schema";
import { tasks } from "@/modules/tasks/schema";
import { obsidianNotes } from "@/modules/obsidian/schema";
import { ideas } from "@/modules/ideas/schema";
import { projectFiles, projects } from "@/modules/projects/schema";
import { notionPages } from "@/modules/notion/schema";

const OLLAMA_BASE = process.env.OLLAMA_BASE_URL ?? "http://localhost:11434";
export const DEFAULT_EMBEDDING_MODEL = "nomic-embed-text";
export const EMBEDDING_MODEL_KEY = "embedding_model";
const ACTIVE_MODEL_KEY = "embedding_model_active";

// Small memo so per-row sweep calls don't hit app_settings each time.
let modelCache: { value: string; at: number } | null = null;

export async function getEmbeddingModel(): Promise<string> {
  if (modelCache && Date.now() - modelCache.at < 60_000) {
    return modelCache.value;
  }
  const { getSetting } = await import("@/core/app-settings");
  const value =
    (await getSetting(EMBEDDING_MODEL_KEY))?.trim() || DEFAULT_EMBEDDING_MODEL;
  modelCache = { value, at: Date.now() };
  return value;
}

export async function embedText(text: string): Promise<number[]> {
  const model = await getEmbeddingModel();
  const res = await fetch(`${OLLAMA_BASE}/api/embeddings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, prompt: text.slice(0, 8000) }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(`ollama embeddings (${model}) → ${res.status}`);
  }
  const data = (await res.json()) as { embedding?: number[] };
  if (!data.embedding?.length) {
    throw new Error(`model "${model}" returned no embedding — is it an embedding model?`);
  }
  return data.embedding;
}

/**
 * Different models live in incompatible vector spaces (and differ in
 * dimensions), so a model switch invalidates every stored embedding. Wipe
 * them all; the sweep rebuilds with the new model.
 */
async function handleModelSwitch(log: (m: string) => void): Promise<void> {
  const { getSetting, setSetting } = await import("@/core/app-settings");
  const configured = await getEmbeddingModel();
  const active = (await getSetting(ACTIVE_MODEL_KEY)) ?? DEFAULT_EMBEDDING_MODEL;
  if (configured === active) return;
  log(`embedding model changed ${active} → ${configured}: re-embedding everything`);
  await db.update(notes).set({ embedding: null });
  await db.update(knowledgeItems).set({ embedding: null });
  await db.update(tasks).set({ embedding: null });
  await db.update(obsidianNotes).set({ embedding: null });
  await db.update(ideas).set({ embedding: null });
  await db.update(notionPages).set({ embedding: null });
  await db.update(projectFiles).set({ embedding: null });
  await setSetting(ACTIVE_MODEL_KEY, configured);
}

const toVec = (e: number[]) => `[${e.join(",")}]`;

/**
 * Background sweep (worker, every 2 min): embed any row that doesn't have an
 * embedding yet. Idempotent by construction — only touches NULL embeddings.
 * Local model via Ollama: free, offline, no tokens.
 */
export async function sweepEmbeddings(
  log: (m: string) => void = () => {},
): Promise<number> {
  await handleModelSwitch(log);
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

  const ideaRows = await db
    .select({ id: ideas.id, title: ideas.title, notes: ideas.notes })
    .from(ideas)
    .where(isNull(ideas.embedding))
    .limit(20);
  for (const i of ideaRows) {
    const e = await embedText(`${i.title}\n${i.notes ?? ""}`);
    await db
      .update(ideas)
      .set({ embedding: dsql`${toVec(e)}::vector` })
      .where(dsql`${ideas.id} = ${i.id}`);
    done++;
  }

  const projectRows = await db
    .select({
      id: projects.id,
      name: projects.name,
      description: projects.description,
    })
    .from(projects)
    .where(isNull(projects.embedding))
    .limit(20);
  for (const p of projectRows) {
    const e = await embedText(`${p.name}\n${p.description ?? ""}`);
    await db
      .update(projects)
      .set({ embedding: dsql`${toVec(e)}::vector` })
      .where(dsql`${projects.id} = ${p.id}`);
    done++;
  }

  // Archival memory entries — recall depends on these.
  const { memoryEntries } = await import("@/core/db/schema/memory");
  const memRows = await db
    .select({ id: memoryEntries.id, text: memoryEntries.text })
    .from(memoryEntries)
    .where(isNull(memoryEntries.embedding))
    .limit(30);
  for (const m of memRows) {
    const e = await embedText(m.text);
    await db
      .update(memoryEntries)
      .set({ embedding: dsql`${toVec(e)}::vector` })
      .where(dsql`${memoryEntries.id} = ${m.id}`);
    done++;
  }

  // Vault index: larger batch — a first sync of a big vault backfills over
  // successive sweeps (~1.5k notes/hour at 50 per 2-min tick).
  const vaultRows = await db
    .select({
      id: obsidianNotes.id,
      title: obsidianNotes.title,
      excerpt: obsidianNotes.excerpt,
    })
    .from(obsidianNotes)
    .where(isNull(obsidianNotes.embedding))
    .limit(50);
  for (const v of vaultRows) {
    const e = await embedText(`${v.title}\n${v.excerpt}`);
    await db
      .update(obsidianNotes)
      .set({ embedding: dsql`${toVec(e)}::vector` })
      .where(dsql`${obsidianNotes.id} = ${v.id}`);
    done++;
  }

  // Notion pages (present only when connected).
  const notionRows = await db
    .select({ id: notionPages.id, title: notionPages.title, content: notionPages.content })
    .from(notionPages)
    .where(isNull(notionPages.embedding))
    .limit(30);
  for (const p of notionRows) {
    const e = await embedText(`${p.title}\n${p.content ?? ""}`);
    await db
      .update(notionPages)
      .set({ embedding: dsql`${toVec(e)}::vector` })
      .where(dsql`${notionPages.id} = ${p.id}`);
    done++;
  }

  // Project files whose text extraction finished (status='ready') — skips
  // rows still processing or that came back unsupported/error.
  const fileRows = await db
    .select({
      id: projectFiles.id,
      filename: projectFiles.filename,
      extractedText: projectFiles.extractedText,
    })
    .from(projectFiles)
    .where(
      dsql`${projectFiles.embedding} is null and ${projectFiles.status} = 'ready'`,
    )
    .limit(20);
  for (const f of fileRows) {
    const e = await embedText(`${f.filename}\n${f.extractedText ?? ""}`);
    await db
      .update(projectFiles)
      .set({ embedding: dsql`${toVec(e)}::vector` })
      .where(dsql`${projectFiles.id} = ${f.id}`);
    done++;
  }

  // Tell open pages that search/connections just got fresher data, so a note
  // you just typed shows its connections without a manual reload.
  if (done > 0) await sql.notify("embeddings_updated", String(done));
  return done;
}

export interface SemanticHit {
  kind: "note" | "knowledge" | "task" | "vault" | "idea" | "notion" | "file";
  id: string;
  title: string;
  snippet: string | null;
  href: string;
  distance: number;
}

function hitHref(kind: string, id: string): string {
  switch (kind) {
    case "note":
      return `/m/notes/${id}`;
    case "knowledge":
      return `/m/knowledge/${id}`;
    case "idea":
      return `/m/ideas/${id}`;
    // vault rows carry the file path in `id` — deep-link into Obsidian.
    case "vault":
      return `obsidian://open?path=${encodeURIComponent(id)}`;
    case "notion":
      return "/m/notion";
    // Opens/downloads the actual attached file.
    case "file":
      return `/api/projects/files/${id}`;
    default:
      return "/m/tasks";
  }
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
    union all
    (select 'vault', path, title, left(excerpt, 160),
            (embedding <=> ${vec}::vector)
       from obsidian_notes where embedding is not null)
    union all
    (select 'idea', id::text, title, left(coalesce(notes, ''), 160),
            (embedding <=> ${vec}::vector)
       from ideas where embedding is not null)
    union all
    (select 'notion', id, title, left(coalesce(content, ''), 160),
            (embedding <=> ${vec}::vector)
       from notion_pages where embedding is not null)
    union all
    (select 'file', id::text, filename, left(coalesce(extracted_text, ''), 160),
            (embedding <=> ${vec}::vector)
       from project_files where embedding is not null)
    order by distance asc
    limit ${limit}
  `);
  return [...rows].map((r) => ({
    kind: r.kind as SemanticHit["kind"],
    id: r.id,
    title: r.title,
    snippet: r.snippet,
    href: hitHref(r.kind, r.id),
    distance: Number(r.distance),
  }));
}

// ── Relations layer ─────────────────────────────────────────────────────────
// (Superseded the old flat relatedTo() — getConnections below is the single
//  cross-type relations engine used by every detail page.)
// Quality gates. Cosine distance: 0 = identical, 1 = orthogonal. In a personal
// corpus, < ~0.55 is a genuine thematic match; looser than that is noise.
export const RELATED_MAX_DISTANCE = 0.55;
const PROJECT_STRONG = 0.45;
const PROJECT_POSSIBLE = 0.58;

export interface Connection {
  kind: "note" | "idea" | "knowledge" | "task" | "vault" | "project";
  id: string;
  title: string;
  snippet: string | null;
  href: string;
  distance: number;
}

export interface ProjectSuggestion {
  id: string;
  name: string;
  confidence: "strong" | "possible";
  distance: number;
}

export interface Connections {
  projectSuggestion: ProjectSuggestion | null;
  related: Connection[];
}

const SOURCE_TABLE: Record<string, string> = {
  note: "notes",
  idea: "ideas",
  knowledge: "knowledge_items",
};

/**
 * Best-fit project via two signals, strongest first:
 *  1) Neighbour vote — which project do this item's closest notes/tasks
 *     already belong to (weighted by closeness). Robust even when a project's
 *     own description is thin.
 *  2) Direct — the project whose name+description embeds closest.
 */
async function suggestProject(
  table: string,
  sourceId: string,
): Promise<ProjectSuggestion | null> {
  // 1 — neighbour vote.
  const voteRows = await db.execute<{
    project_ref: string;
    score: number;
    best: number;
    n: number;
  }>(dsql`
    with target as (
      select embedding from ${dsql.raw(table)}
       where id = ${sourceId} and embedding is not null),
    neighbours as (
      select project_ref,
             (embedding <=> (select embedding from target)) as d
        from (
          select project_ref, embedding, id::text as rid from notes
           where embedding is not null and project_ref is not null
          union all
          select project_ref, embedding, id::text as rid from tasks
           where embedding is not null and project_ref is not null
        ) x
       where rid <> ${sourceId}
         and (select embedding from target) is not null
         and (embedding <=> (select embedding from target)) < ${RELATED_MAX_DISTANCE})
    select project_ref,
           sum(${RELATED_MAX_DISTANCE} - d)::float8 as score,
           min(d)::float8 as best,
           count(*)::int as n
      from neighbours
     group by project_ref
     order by score desc
     limit 1
  `);
  const vote = [...voteRows][0];
  if (vote?.project_ref) {
    const projectId = vote.project_ref.split(":")[1];
    const [row] = await db.execute<{ name: string }>(
      dsql`select name from projects where id = ${projectId}`,
    );
    if (row) {
      // Strong when multiple neighbours agree or one is very close.
      const strong = vote.n >= 2 || Number(vote.best) < 0.42;
      return {
        id: projectId,
        name: row.name,
        distance: Number(vote.best),
        confidence: strong ? "strong" : "possible",
      };
    }
  }

  // 2 — direct project embedding (fallback).
  const projRows = await db.execute<{
    id: string;
    name: string;
    distance: number;
  }>(dsql`
    with target as (
      select embedding from ${dsql.raw(table)}
       where id = ${sourceId} and embedding is not null)
    select p.id::text, p.name,
           (p.embedding <=> (select embedding from target))::float8 as distance
      from projects p
     where p.embedding is not null
       and (select embedding from target) is not null
     order by distance asc
     limit 1
  `);
  const top = [...projRows][0];
  if (top && Number(top.distance) <= PROJECT_POSSIBLE) {
    return {
      id: top.id,
      name: top.name,
      distance: Number(top.distance),
      confidence: Number(top.distance) <= PROJECT_STRONG ? "strong" : "possible",
    };
  }
  return null;
}

/**
 * The relations engine: from any source item, return a best-fit project
 * suggestion (with confidence) plus quality-gated, cross-type neighbours.
 * Never throws — degrades to empty when embeddings aren't ready yet.
 */
export async function getConnections(
  sourceKind: "note" | "idea" | "knowledge",
  sourceId: string,
  opts: { limit?: number; currentProjectId?: string | null } = {},
): Promise<Connections> {
  const table = SOURCE_TABLE[sourceKind];
  if (!table) return { projectSuggestion: null, related: [] };
  const limit = opts.limit ?? 6;
  const selfClause = (col: string, k: string) =>
    dsql.raw(
      `not ('${sourceKind}' = '${k}' and ${col} = '${sourceId.replace(/'/g, "")}')`,
    );

  try {
    let projectSuggestion: ProjectSuggestion | null = null;
    if (!opts.currentProjectId) {
      projectSuggestion = await suggestProject(table, sourceId);
    }

    const rows = await db.execute<{
      kind: string;
      id: string;
      title: string;
      snippet: string | null;
      distance: number;
    }>(dsql`
      with target as (
        select embedding from ${dsql.raw(table)}
         where id = ${sourceId} and embedding is not null)
      (select 'note' as kind, n.id::text, n.title, left(n.body, 140) as snippet,
              (n.embedding <=> (select embedding from target)) as distance
         from notes n where n.embedding is not null and ${selfClause("n.id::text", "note")})
      union all
      (select 'idea', i.id::text, i.title, left(coalesce(i.notes, ''), 140),
              (i.embedding <=> (select embedding from target))
         from ideas i where i.embedding is not null and ${selfClause("i.id::text", "idea")})
      union all
      (select 'knowledge', k.id::text, coalesce(k.title, left(k.input, 80)),
              (k.insight->>'summary'), (k.embedding <=> (select embedding from target))
         from knowledge_items k where k.embedding is not null and ${selfClause("k.id::text", "knowledge")})
      union all
      (select 'vault', o.path, o.title, left(o.excerpt, 140),
              (o.embedding <=> (select embedding from target))
         from obsidian_notes o where o.embedding is not null)
      order by distance asc
      limit ${limit + 4}
    `);

    const related: Connection[] = [...rows]
      .map((r) => ({
        kind: r.kind as Connection["kind"],
        id: r.id,
        title: r.title,
        snippet: r.snippet,
        href: hitHref(r.kind, r.id),
        distance: Number(r.distance),
      }))
      .filter((c) => c.distance <= RELATED_MAX_DISTANCE)
      .slice(0, limit);

    return { projectSuggestion, related };
  } catch {
    return { projectSuggestion: null, related: [] };
  }
}
