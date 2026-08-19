// Backbone-bound project targeting. The association (which project a write
// lands on) is well-defined and static, so an agent never supplies it as an id
// — these helpers resolve the target from the FOCUSED subject (or, for a survey
// write, a validated name/id). This is what makes cross-wiring structurally
// impossible rather than merely discouraged in a prompt.
import { and, eq, sql } from "drizzle-orm";
import type { AiToolContext } from "@/core/modules/types.server";
import { db as defaultDb } from "@/core/db/client";
import { projects } from "./schema";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The project id a PER-SUBJECT write must target. In an AGENT run the only valid
 * target is the backbone-focused subject (set by projects.focusNext); any
 * model-supplied id is ignored, so a judgement cannot land on the wrong project.
 * Chat (a human named the project) uses the explicit id.
 */
export function boundProjectId(
  ctx: AiToolContext,
  fallbackId?: string,
): { id: string } | { error: string } {
  // The focused subject ALWAYS wins — a model-supplied id is ignored while a
  // subject is bound, so a judgement cannot land on the wrong project. Only
  // when nothing is focused (chat, or an agent that hasn't been re-synced to the
  // focusNext prompt) do we fall back to the supplied id, which the write's own
  // not-found check validates. This keeps a tool/contract change from ever
  // hard-breaking an un-synced agent.
  if (ctx.subject?.kind === "project" && ctx.subject.id) {
    return { id: ctx.subject.id };
  }
  if (fallbackId) return { id: fallbackId };
  return {
    error:
      "No project is focused. In an agent run, call projects.focusNext first — this write then targets the focused project (no id). In chat, pass the project id.",
  };
}

/**
 * Resolve a project TARGET for a SURVEY write (the agent legitimately picks
 * WHICH project a card / next-action is about — e.g. the daily planner). Order:
 *  1) the focused subject, if one is bound (safest);
 *  2) a NAME handle → a single ACTIVE project (validated; never a raw uuid the
 *     model could mis-copy);
 *  3) a legacy explicit id (chat), VALIDATED to a real project.
 * Never trusts an unvalidated id.
 */
export async function resolveProjectTarget(
  ctx: AiToolContext,
  opts: { name?: string | null; id?: string | null },
): Promise<{ id: string; name: string } | { error: string }> {
  const db = ctx.db ?? defaultDb;
  if (ctx.subject?.kind === "project" && ctx.subject.id) {
    return { id: ctx.subject.id, name: ctx.subject.name };
  }
  const name = opts.name?.trim();
  if (name) {
    const rows = await db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(
        and(
          eq(projects.status, "active"),
          sql`lower(${projects.name}) = ${name.toLowerCase()}`,
        ),
      );
    if (rows.length === 1) return rows[0];
    if (rows.length === 0)
      return {
        error: `No active project named "${name}". Use the exact name from your project list.`,
      };
    return {
      error: `"${name}" matches ${rows.length} active projects — ambiguous, cannot target safely.`,
    };
  }
  const id = opts.id?.trim();
  if (id) {
    if (!UUID_RE.test(id)) return { error: "project id is not a valid uuid" };
    const [p] = await db
      .select({ id: projects.id, name: projects.name })
      .from(projects)
      .where(eq(projects.id, id))
      .limit(1);
    return p ?? { error: "project id points to no project" };
  }
  return { error: "no project target: focus a project, or pass its exact name" };
}
