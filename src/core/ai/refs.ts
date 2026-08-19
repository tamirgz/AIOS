// Per-run entity handles for SURVEY agent writes. The association is still not
// left to the model as a raw UUID it could mis-transcribe: a list tool issues a
// short kind-prefixed handle (t1, i2, p3…) that the backbone maps back to the
// real id, validated against what was actually listed. An unknown handle errors
// rather than silently mis-filing onto another entity.
import type { AiToolContext } from "@/core/modules/types.server";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Register listed rows under short per-run handles and return each row with its
 * `ref`. A row already registered this run keeps its handle, so re-listing is
 * stable. `name`/`title` (whichever the row has) is stored for error messages.
 */
export function registerRefs<T extends { id: string; name?: string; title?: string }>(
  ctx: AiToolContext,
  kind: string,
  prefix: string,
  rows: T[],
): (T & { ref: string })[] {
  const refs = (ctx.refs ??= {});
  const nextHandle = () => {
    let n = 1;
    while (refs[`${prefix}${n}`]) n++;
    return `${prefix}${n}`;
  };
  return rows.map((r) => {
    let ref = Object.keys(refs).find(
      (k) => refs[k].kind === kind && refs[k].id === r.id,
    );
    if (!ref) {
      ref = nextHandle();
      refs[ref] = { kind, id: r.id, name: r.name ?? r.title ?? "" };
    }
    return { ...r, ref };
  });
}

/**
 * Resolve a handle (or a raw uuid, for chat where a human named the entity) to a
 * real id of the given kind. An unknown handle is an ERROR — a survey write can
 * never silently target the wrong entity.
 */
export function resolveRef(
  ctx: AiToolContext,
  kind: string,
  ref: string | undefined | null,
): { id: string } | { error: string } {
  const key = ref?.trim();
  if (!key)
    return { error: `No ${kind} ref given — pass the ref from the ${kind} list.` };
  const hit = ctx.refs?.[key];
  if (hit) {
    if (hit.kind !== kind)
      return { error: `"${key}" refers to a ${hit.kind}, not a ${kind}.` };
    return { id: hit.id };
  }
  if (UUID_RE.test(key)) return { id: key }; // chat / an explicit id
  return {
    error: `Unknown ${kind} "${key}". Call the ${kind} list first and use the ref it returns.`,
  };
}
