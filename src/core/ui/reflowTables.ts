/**
 * Local models sometimes emit a GFM table collapsed onto ONE line
 * (`| a | b | |---|---| | 1 | 2 |`), sometimes with a corrupted delimiter cell
 * (`---}`), so a markdown parser can't see it as a table and it renders as a
 * wall of pipes. `reflowCollapsedTables` splits any such line into a proper
 * multi-line table.
 *
 * Pure (no React) so EVERY markdown surface can share it — the chat/report
 * renderer, the note view, the Ask answer, and the PDF export. Well-formed
 * tables (delimiter already on its own line) are left untouched, and the
 * transform is idempotent, so it's safe to run on every render including on
 * already-saved content.
 */
export function reflowCollapsedTables(md: string): string {
  return md.split("\n").map(reflowLine).join("\n");
}

function reflowLine(line: string): string {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|")) return line;
  const cells = trimmed.split("|").map((c) => c.trim());
  // A delimiter cell is dashes with optional colons, tolerating a trailing typo
  // char the model occasionally appends (e.g. `---}`).
  const isDelim = (c: string) => /^:?-{2,}:?[)}\]]?$/.test(c);
  const idxs = cells.map((c, i) => (isDelim(c) ? i : -1)).filter((i) => i >= 0);
  if (idxs.length < 2) return line;
  const firstDelim = idxs[0];
  const lastDelim = idxs[idxs.length - 1];
  // Header = content cells before the delimiter run. Empty ⇒ the delimiter is
  // already the line's own row (a well-formed table) → leave it alone.
  const header = cells.slice(0, firstDelim).filter((c) => c !== "");
  if (header.length === 0) return line;
  // Body cells after the delimiter run, split into rows on the empty cells that
  // mark row boundaries in the collapsed form.
  const rows: string[][] = [];
  let cur: string[] = [];
  for (const c of cells.slice(lastDelim + 1)) {
    if (c === "") {
      if (cur.length) {
        rows.push(cur);
        cur = [];
      }
    } else cur.push(c);
  }
  if (cur.length) rows.push(cur);
  return [
    `| ${header.join(" | ")} |`,
    `| ${Array(header.length).fill("---").join(" | ")} |`,
    ...rows.map((r) => `| ${r.join(" | ")} |`),
  ].join("\n");
}
