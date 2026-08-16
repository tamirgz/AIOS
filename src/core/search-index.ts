/**
 * Keep the unified `search_index` in sync with the sources that don't own an
 * embedding column — Gmail, Calendar, Telegram, external reports, People, Inbox,
 * and our own Workbench results / Ask answers. Runs on the worker alongside the
 * embedding sweep.
 *
 * Idempotent by construction (the global recurring-job rule): each source is one
 * UPSERT keyed on (kind, source_id) plus a `content_hash` gate — a row is only
 * re-embedded when its text actually changed — and one orphan-delete so removed
 * source rows drop out. No LLM, no network: pure SQL over local Postgres; the
 * embeddings themselves are filled later by the local sweep.
 */
import { sql as dsql } from "drizzle-orm";
import { db } from "@/core/db/client";

/**
 * One UPSERT per source. `insert ... select` reads straight from the source
 * table; ON CONFLICT refreshes the text and, when the content_hash moved, nulls
 * the embedding so the sweep recomputes it. Rows carrying their own project
 * links pass them through; the rest default to [].
 */
const UPSERTS = [
  // Gmail — subject + sender + snippet.
  dsql`
    insert into search_index (kind, source_id, title, snippet, href, content_hash)
    select 'mail', id,
           coalesce(nullif(subject,''),'(no subject)'),
           left(coalesce(from_name, from_email, '') || ' — ' || coalesce(snippet,''), 500),
           '/m/mail',
           md5(coalesce(subject,'') || '|' || coalesce(snippet,''))
      from gmail_messages
    on conflict (kind, source_id) do update set
      title=excluded.title, snippet=excluded.snippet, href=excluded.href,
      content_hash=excluded.content_hash,
      embedding = case when search_index.content_hash <> excluded.content_hash then null else search_index.embedding end,
      updated_at=now()`,
  // Calendar events — title + when/where + notes.
  dsql`
    insert into search_index (kind, source_id, title, snippet, href, content_hash)
    select 'event', id::text,
           coalesce(nullif(title,''),'(untitled event)'),
           left(to_char(start_at,'YYYY-MM-DD HH24:MI') || '  ' || coalesce(location,'') || '  ' || coalesce(notes,''), 500),
           '/m/calendar',
           md5(coalesce(title,'') || '|' || coalesce(notes,'') || '|' || coalesce(start_at::text,''))
      from calendar_events
    on conflict (kind, source_id) do update set
      title=excluded.title, snippet=excluded.snippet, href=excluded.href,
      content_hash=excluded.content_hash,
      embedding = case when search_index.content_hash <> excluded.content_hash then null else search_index.embedding end,
      updated_at=now()`,
  // Telegram posts — channel + text (+ any linked article text).
  dsql`
    insert into search_index (kind, source_id, title, snippet, href, content_hash)
    select 'telegram', id::text,
           left(channel || ': ' || coalesce(text,''), 80),
           left(coalesce(text,'') || '  ' || coalesce(linked_text,''), 500),
           '/m/telegram',
           md5(coalesce(text,'') || '|' || coalesce(linked_text,''))
      from telegram_posts
     where coalesce(text,'') <> ''
    on conflict (kind, source_id) do update set
      title=excluded.title, snippet=excluded.snippet, href=excluded.href,
      content_hash=excluded.content_hash,
      embedding = case when search_index.content_hash <> excluded.content_hash then null else search_index.embedding end,
      updated_at=now()`,
  // External reports (Slack-ingested etc.).
  dsql`
    insert into search_index (kind, source_id, title, snippet, href, content_hash)
    select 'report', id::text,
           coalesce(nullif(title,''),'(report)'),
           left(coalesce(body,''), 500),
           '/m/agents',
           md5(coalesce(title,'') || '|' || coalesce(body,''))
      from external_reports
    on conflict (kind, source_id) do update set
      title=excluded.title, snippet=excluded.snippet, href=excluded.href,
      content_hash=excluded.content_hash,
      embedding = case when search_index.content_hash <> excluded.content_hash then null else search_index.embedding end,
      updated_at=now()`,
  // People — name + role/notes + meeting count.
  dsql`
    insert into search_index (kind, source_id, title, snippet, href, content_hash)
    select 'person', id::text,
           coalesce(nullif(name,''), email, '(person)'),
           left(coalesce(last_event_title,'') || '  ' || coalesce(notes,'') || '  (' || coalesce(meeting_count::text,'0') || ' meetings)', 400),
           '/m/people',
           md5(coalesce(name,'') || '|' || coalesce(notes,'') || '|' || coalesce(last_event_title,''))
      from people
    on conflict (kind, source_id) do update set
      title=excluded.title, snippet=excluded.snippet, href=excluded.href,
      content_hash=excluded.content_hash,
      embedding = case when search_index.content_hash <> excluded.content_hash then null else search_index.embedding end,
      updated_at=now()`,
  // Inbox captures.
  dsql`
    insert into search_index (kind, source_id, title, snippet, href, content_hash)
    select 'inbox', id::text,
           left(coalesce(input,'(inbox item)'), 80),
           left(coalesce(input,''), 400),
           '/m/inbox',
           md5(coalesce(input,''))
      from inbox_items
    on conflict (kind, source_id) do update set
      title=excluded.title, snippet=excluded.snippet, href=excluded.href,
      content_hash=excluded.content_hash,
      embedding = case when search_index.content_hash <> excluded.content_hash then null else search_index.embedding end,
      updated_at=now()`,
  // Workbench results — the finished analysis IS knowledge worth finding later.
  dsql`
    insert into search_index (kind, source_id, title, snippet, href, content_hash, project_refs)
    select 'workbench', t.id::text,
           coalesce(nullif(t.title,''),'(task)'),
           left(coalesce(a.result, t.summary, t.prompt), 1000),
           '/m/workbench/' || t.id::text,
           md5(coalesce(a.result, t.summary, t.prompt, '')),
           t.project_refs
      from workbench_tasks t
      left join lateral (
        select result from task_attempts
         where task_id = t.id and result is not null
         order by seq desc limit 1
      ) a on true
     where t.status in ('done','review','needs_input') and t.archived_at is null
    on conflict (kind, source_id) do update set
      title=excluded.title, snippet=excluded.snippet, href=excluded.href,
      content_hash=excluded.content_hash, project_refs=excluded.project_refs,
      embedding = case when search_index.content_hash <> excluded.content_hash then null else search_index.embedding end,
      updated_at=now()`,
  // Project features — user-authored specs, already tied to their project.
  dsql`
    insert into search_index (kind, source_id, title, snippet, href, content_hash, project_refs)
    select 'feature', id::text,
           coalesce(nullif(name,''),'(feature)'),
           left(coalesce(description,''), 500),
           '/m/projects/' || project_id::text,
           md5(coalesce(name,'') || '|' || coalesce(description,'')),
           jsonb_build_array('projects:' || project_id::text)
      from features
    on conflict (kind, source_id) do update set
      title=excluded.title, snippet=excluded.snippet, href=excluded.href,
      content_hash=excluded.content_hash, project_refs=excluded.project_refs,
      embedding = case when search_index.content_hash <> excluded.content_hash then null else search_index.embedding end,
      updated_at=now()`,
  // Ask answers.
  dsql`
    insert into search_index (kind, source_id, title, snippet, href, content_hash, project_refs)
    select 'ask', id::text,
           coalesce(nullif(title,''), left(query, 80)),
           left(coalesce(answer,''), 1000),
           '/m/ask',
           md5(coalesce(answer,'')),
           project_refs
      from ask_history
    on conflict (kind, source_id) do update set
      title=excluded.title, snippet=excluded.snippet, href=excluded.href,
      content_hash=excluded.content_hash, project_refs=excluded.project_refs,
      embedding = case when search_index.content_hash <> excluded.content_hash then null else search_index.embedding end,
      updated_at=now()`,
] as const;

/** Delete index rows whose source item is gone (kept in step with each source). */
const ORPHAN_DELETES = [
  dsql`delete from search_index where kind='mail' and source_id not in (select id from gmail_messages)`,
  dsql`delete from search_index where kind='event' and source_id not in (select id::text from calendar_events)`,
  dsql`delete from search_index where kind='telegram' and source_id not in (select id::text from telegram_posts)`,
  dsql`delete from search_index where kind='report' and source_id not in (select id::text from external_reports)`,
  dsql`delete from search_index where kind='person' and source_id not in (select id::text from people)`,
  dsql`delete from search_index where kind='inbox' and source_id not in (select id::text from inbox_items)`,
  dsql`delete from search_index where kind='workbench' and source_id not in (select id::text from workbench_tasks where status in ('done','review','needs_input') and archived_at is null)`,
  dsql`delete from search_index where kind='ask' and source_id not in (select id::text from ask_history)`,
  dsql`delete from search_index where kind='feature' and source_id not in (select id::text from features)`,
] as const;

/** Upsert every source into the unified index, then drop orphans. Best-effort. */
export async function syncSearchIndex(log: (m: string) => void = () => {}): Promise<void> {
  for (const q of UPSERTS) {
    try {
      await db.execute(q);
    } catch (e) {
      log(`search-index upsert failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  for (const q of ORPHAN_DELETES) {
    try {
      await db.execute(q);
    } catch {
      /* orphan cleanup is best-effort */
    }
  }
}
