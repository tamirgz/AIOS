import { isNull, sql as dsql } from "drizzle-orm";
import { db, sql } from "@/core/db/client";
import { notes } from "@/modules/notes/schema";
import { knowledgeItems } from "@/modules/knowledge/schema";
import { tasks } from "@/modules/tasks/schema";
import { obsidianNotes } from "@/modules/obsidian/schema";
import { ideas } from "@/modules/ideas/schema";
import { projectFiles, projects } from "@/modules/projects/schema";
import { notionPages } from "@/modules/notion/schema";
import { attentionItems } from "@/modules/today/schema";
import { searchIndex } from "@/core/db/schema/search-index";

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
  await db.update(attentionItems).set({ embedding: null });
  await db.update(searchIndex).set({ embedding: null });
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
      goal: projects.goal,
      nextAction: projects.nextAction,
    })
    .from(projects)
    .where(isNull(projects.embedding))
    .limit(20);
  for (const p of projectRows) {
    // Embed the project from its actual WORK, not just its name — name+goal
    // alone is too sparse to tell a real task ("move the encrypted code") from
    // an unrelated one ("consult a lawyer"), which is what let agents mis-anchor
    // cards. Linked task/note titles ground the embedding in the real theme.
    const ref = `projects:${p.id}`;
    const [ptasks, pnotes] = await Promise.all([
      db.select({ t: tasks.title }).from(tasks).where(dsql`${tasks.projectRef} = ${ref}`).limit(30),
      db.select({ t: notes.title }).from(notes).where(dsql`${notes.projectRef} = ${ref}`).limit(30),
    ]);
    const text = [
      p.name,
      p.goal,
      p.description,
      p.nextAction,
      ...ptasks.map((r) => r.t),
      ...pnotes.map((r) => r.t),
    ]
      .filter(Boolean)
      .join("\n");
    const e = await embedText(text);
    await db
      .update(projects)
      .set({ embedding: dsql`${toVec(e)}::vector` })
      .where(dsql`${projects.id} = ${p.id}`);
    done++;
  }

  // Open attention items — powers raise-time semantic dedup. Only OPEN rows
  // matter (dedup only compares against open cards); backfills anything that
  // missed embedding at insert (e.g. Ollama was briefly down).
  const attnRows = await db
    .select({ id: attentionItems.id, title: attentionItems.title })
    .from(attentionItems)
    .where(dsql`${attentionItems.embedding} is null and ${attentionItems.status} = 'open'`)
    .limit(30);
  for (const a of attnRows) {
    const e = await embedText(a.title);
    await db
      .update(attentionItems)
      .set({ embedding: dsql`${toVec(e)}::vector` })
      .where(dsql`${attentionItems.id} = ${a.id}`);
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

  // Unified index rows (Gmail, Calendar, Telegram, reports, People, Inbox,
  // Workbench results, Ask answers) — same local model, one loop.
  const idxRows = await db
    .select({ id: searchIndex.id, title: searchIndex.title, snippet: searchIndex.snippet })
    .from(searchIndex)
    .where(isNull(searchIndex.embedding))
    .limit(40);
  for (const r of idxRows) {
    const e = await embedText(`${r.title}\n${r.snippet ?? ""}`);
    await db
      .update(searchIndex)
      .set({ embedding: dsql`${toVec(e)}::vector` })
      .where(dsql`${searchIndex.id} = ${r.id}`);
    done++;
  }

  // Tell open pages that search/connections just got fresher data, so a note
  // you just typed shows its connections without a manual reload.
  if (done > 0) await sql.notify("embeddings_updated", String(done));
  return done;
}

export interface SemanticHit {
  kind:
    | "note"
    | "knowledge"
    | "task"
    | "vault"
    | "idea"
    | "notion"
    | "file"
    | "project"
    | "attention"
    | "memory"
    | "mail"
    | "event"
    | "telegram"
    | "report"
    | "person"
    | "inbox"
    | "workbench"
    | "ask"
    | "feature";
  id: string;
  title: string;
  snippet: string | null;
  href: string;
  distance: number;
  /** The area-of-development drawer this item was classified into (index rows). */
  area: string | null;
}

/** Fallback link for kinds whose UNION branch didn't select an explicit href. */
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
    case "memory":
      return "/m/settings/memory";
    default:
      return "/m/tasks";
  }
}

/**
 * Semantic search across the WHOLE corpus: the per-table embedded sources plus
 * the unified `search_index` (Gmail, Calendar, Telegram, reports, People, Inbox,
 * Workbench results, Ask answers) plus projects/attention/memory that used to be
 * embedded-but-unsearchable. One query, one local vector space.
 */
export async function searchEverything(
  query: string,
  limit = 8,
  opts?: { area?: string | null },
): Promise<SemanticHit[]> {
  const vec = toVec(await embedText(query));
  // "Open the relevant drawer": when the query's area is known, discount
  // same-area index items so they rank ahead of equally-similar off-topic ones.
  const boost = opts?.area
    ? dsql`* (case when area_ref = ${opts.area} then 0.82 else 1 end)`
    : dsql``;
  const rows = await db.execute<{
    kind: string;
    id: string;
    title: string;
    snippet: string | null;
    href: string | null;
    area: string | null;
    distance: number;
  }>(dsql`
    (select 'note' as kind, id::text, title, left(body, 160) as snippet,
            null::text as href, null::text as area, (embedding <=> ${vec}::vector) as distance
       from notes where embedding is not null)
    union all
    (select 'knowledge', id::text, coalesce(title, left(input, 80)),
            (insight->>'summary'), null, null, (embedding <=> ${vec}::vector)
       from knowledge_items where embedding is not null)
    union all
    (select 'task', id::text, title, null, null, null,
            (embedding <=> ${vec}::vector)
       from tasks where embedding is not null)
    union all
    (select 'vault', path, title, left(excerpt, 160), null, null,
            (embedding <=> ${vec}::vector)
       from obsidian_notes where embedding is not null)
    union all
    (select 'idea', id::text, title, left(coalesce(notes, ''), 160), null, null,
            (embedding <=> ${vec}::vector)
       from ideas where embedding is not null)
    union all
    (select 'notion', id, title, left(coalesce(content, ''), 160), null, null,
            (embedding <=> ${vec}::vector)
       from notion_pages where embedding is not null)
    union all
    (select 'file', id::text, filename, left(coalesce(extracted_text, ''), 160), null, null,
            (embedding <=> ${vec}::vector)
       from project_files where embedding is not null)
    union all
    (select 'project', id::text, name, left(coalesce(description, ''), 160),
            '/m/projects/' || id::text, null, (embedding <=> ${vec}::vector)
       from projects where embedding is not null)
    union all
    (select 'attention', id::text, title, left(coalesce(body, ''), 160), href, null,
            (embedding <=> ${vec}::vector)
       from attention_items where embedding is not null)
    union all
    (select 'memory', id::text, left(text, 80), left(text, 200), null, null,
            (embedding <=> ${vec}::vector)
       from memory_entries where embedding is not null)
    union all
    (select kind, source_id, title, snippet, href, area_ref,
            (embedding <=> ${vec}::vector) ${boost}
       from search_index where embedding is not null)
    order by distance asc
    limit ${limit}
  `);
  return [...rows].map((r) => ({
    kind: r.kind as SemanticHit["kind"],
    id: r.id,
    title: r.title,
    snippet: r.snippet,
    href: r.href ?? hitHref(r.kind, r.id),
    area: r.area ?? null,
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
 * Best-fit ACTIVE project for a piece of free text (e.g. a freshly-captured
 * inbox item), by embedding the text and comparing to project embeddings.
 * Same confidence gates as the item-based matcher. Never throws — returns null
 * when embeddings aren't ready or nothing is close enough.
 */
export async function matchProjectByText(
  text: string,
): Promise<{ id: string; name: string; confidence: "strong" | "possible" } | null> {
  const clean = text.trim();
  if (!clean) return null;
  try {
    const vec = await embedText(clean.slice(0, 2000));
    const rows = await db.execute<{ id: string; name: string; distance: number }>(dsql`
      select p.id::text, p.name,
             (p.embedding <=> ${toVec(vec)}::vector)::float8 as distance
        from projects p
       where p.embedding is not null and p.status = 'active'
       order by distance asc
       limit 1
    `);
    const top = [...rows][0];
    if (top && Number(top.distance) <= PROJECT_POSSIBLE) {
      return {
        id: top.id,
        name: top.name,
        confidence: Number(top.distance) <= PROJECT_STRONG ? "strong" : "possible",
      };
    }
  } catch {
    // embeddings not ready / ollama down — no match rather than an error
  }
  return null;
}

/**
 * Neighbour-vote project match for free text: which project do this text's
 * closest notes/tasks already belong to? Robust even when a project's own
 * description is thin, because it uses the project's REAL contents, not a
 * synthetic project vector. "Strong" when ≥2 neighbours agree or one is very
 * close. Text-based sibling of suggestProject (which works from an item id).
 */
export async function suggestProjectByText(
  text: string,
): Promise<{ id: string; confidence: "strong" | "possible" } | null> {
  const clean = text.trim();
  if (!clean) return null;
  try {
    const v = toVec(await embedText(clean.slice(0, 2000)));
    const rows = await db.execute<{ project_ref: string; best: number; n: number }>(dsql`
      with neighbours as (
        select project_ref, (embedding <=> ${v}::vector) as d
          from (
            select project_ref, embedding from notes where embedding is not null and project_ref is not null
            union all
            select project_ref, embedding from tasks where embedding is not null and project_ref is not null
          ) x
         where (embedding <=> ${v}::vector) < ${RELATED_MAX_DISTANCE})
      select project_ref, min(d)::float8 as best, count(*)::int as n
        from neighbours
       group by project_ref
       order by sum(${RELATED_MAX_DISTANCE} - d) desc
       limit 1
    `);
    const vote = [...rows][0];
    if (vote?.project_ref) {
      return {
        id: vote.project_ref.split(":")[1],
        confidence: vote.n >= 2 || Number(vote.best) < 0.42 ? "strong" : "possible",
      };
    }
  } catch {
    // embeddings not ready / ollama down — no vote rather than an error
  }
  return null;
}

/**
 * Decide a card's project anchor from EVIDENCE about the card itself, not from
 * the raising model's guess — because a weak agent stamps the week's dominant
 * project on everything ("consult a lawyer" → GitLocker). Two independent
 * signals: the enriched project embedding (matchProjectByText) and a
 * neighbour vote over real linked items (suggestProjectByText). Abstain by
 * default — a wrong tag is worse than none — anchoring only when the evidence
 * is clear:
 *   • both signals agree                          → anchor
 *   • the neighbour vote is strong                → anchor
 *   • the embedding is strong and the vote agrees → anchor
 *   • the agent's own ref is corroborated by either signal → keep it
 *   • otherwise                                   → null (leave it personal)
 */
export async function groundProjectRef(
  projectRef: string | null | undefined,
  text: string,
): Promise<string | null> {
  const agentId = projectRef
    ? projectRef.startsWith("projects:")
      ? projectRef.slice("projects:".length)
      : projectRef
    : null;

  const [emb, vote] = await Promise.all([
    matchProjectByText(text),
    suggestProjectByText(text),
  ]);

  let id: string | null = null;
  if (emb && vote && emb.id === vote.id) id = emb.id; // both agree
  else if (vote?.confidence === "strong") id = vote.id; // strong neighbour evidence
  else if (emb?.confidence === "strong" && (!vote || vote.id === emb.id)) id = emb.id;
  // Agent's guess counts only when a semantic signal (even a weaker one) backs it.
  else if (agentId && (emb?.id === agentId || vote?.id === agentId)) id = agentId;

  return id ? `projects:${id}` : null;
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
