import postgres from "postgres";

/**
 * Read-only connection to iSentry's Supabase Postgres.
 *
 * Kept SEPARATE from the apOS db (src/core/db/client.ts) on purpose: apOS is the
 * agentic BRAIN, iSentry is a data SOURCE it reads — the same relationship apOS
 * has with Slack/Google/SearXNG. Lazy + gated so a missing config never crashes
 * the app; the module simply reports "not connected" until it's set.
 *
 * SECURITY: point ISENTRY_DATABASE_URL at a RESTRICTED READ-ONLY role, never the
 * Supabase service_role key. During single-user validation, scope reads to your
 * own rows with ISENTRY_ACCOUNT_ID. For the Supabase transaction pooler (port
 * 6543) postgres.js needs prepare:false (set below).
 */
const g = globalThis as unknown as {
  __isentrySql?: ReturnType<typeof postgres>;
};

export function isentryConfigured(): boolean {
  return !!process.env.ISENTRY_DATABASE_URL?.trim();
}

/** Account to scope every query to — during single-user validation this pins
 *  reads to the owner's rows. Omit to read all rows (only safe when solo). */
export function isentryAccountId(): string | null {
  return process.env.ISENTRY_ACCOUNT_ID?.trim() || null;
}

export function isentrySql() {
  const url = process.env.ISENTRY_DATABASE_URL?.trim();
  if (!url)
    throw new Error(
      "iSentry not connected — set ISENTRY_DATABASE_URL to a read-only Supabase connection string.",
    );
  if (!g.__isentrySql) {
    // small pool; prepare:false for the Supabase pgbouncer pooler.
    g.__isentrySql = postgres(url, { max: 4, prepare: false });
  }
  return g.__isentrySql;
}
