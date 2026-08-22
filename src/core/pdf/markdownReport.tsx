/**
 * Generic markdown → PDF report renderer. Server-only (@react-pdf/renderer is
 * Node-targeted). Turns a title + light-markdown body into a clean, downloadable
 * A4 report — used by the chat "export as PDF" action and reusable anywhere.
 *
 * Renders GFM tables as real tables and viz.chart embeds as a native horizontal
 * bar chart (from the stored chart spec), so an investment report exports with
 * the same structure it shows on screen.
 */
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import { eq } from "drizzle-orm";
import { db } from "@/core/db/client";
import { charts } from "@/modules/investments/schema";
import { fmtFn, type ChartSpec } from "@/core/viz/chartOption";
import { reflowCollapsedTables } from "@/core/ui/reflowTables";

const INK = "#1a1a1a";
const POS = "#12894f";
const NEG = "#c33b39";

const styles = StyleSheet.create({
  page: {
    paddingTop: 54,
    paddingBottom: 56,
    paddingHorizontal: 56,
    fontSize: 10.5,
    lineHeight: 1.5,
    color: INK,
    fontFamily: "Helvetica",
  },
  eyebrow: {
    fontSize: 8,
    letterSpacing: 2,
    color: "#8a8a8a",
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e2e2",
    paddingBottom: 10,
    marginBottom: 18,
  },
  meta: { fontSize: 8, color: "#9a9a9a", textAlign: "right" },
  title: {
    fontSize: 17,
    fontFamily: "Helvetica-Bold",
    color: "#0b0b0b",
    marginBottom: 16,
    lineHeight: 1.3,
  },
  heading: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: "#0b0b0b",
    marginTop: 14,
    marginBottom: 6,
  },
  paragraph: { marginBottom: 8 },
  bulletRow: { flexDirection: "row", marginBottom: 3, paddingLeft: 6 },
  bulletDot: { width: 12, fontFamily: "Helvetica-Bold", color: "#555" },
  bulletText: { flex: 1 },
  bold: { fontFamily: "Helvetica-Bold" },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: "#e8e8e8",
    marginVertical: 12,
  },
  // Tables
  table: {
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#e2e2e2",
    borderRadius: 3,
  },
  trHead: {
    flexDirection: "row",
    backgroundColor: "#f4f4f2",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e2e2",
  },
  tr: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: "#eeeeee",
  },
  th: {
    flex: 1,
    paddingVertical: 4,
    paddingHorizontal: 6,
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#555",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  td: {
    flex: 1,
    paddingVertical: 4,
    paddingHorizontal: 6,
    fontSize: 9.5,
    color: "#222",
  },
  // Native chart
  chartTitle: {
    fontSize: 10.5,
    fontFamily: "Helvetica-Bold",
    color: "#0b0b0b",
    marginBottom: 1,
  },
  chartSub: { fontSize: 8, color: "#9a9a9a", marginBottom: 8 },
  chartRow: { flexDirection: "row", alignItems: "center", marginBottom: 2.5 },
  chartLabel: { width: 54, fontSize: 8.5, color: "#333", textAlign: "right", paddingRight: 6 },
  chartTrack: { flex: 1, flexDirection: "row", alignItems: "center", height: 9 },
  chartHalf: { flex: 1, flexDirection: "row", height: 9 },
  chartVal: { width: 62, fontSize: 8, color: "#555", paddingLeft: 6 },
  footer: {
    position: "absolute",
    bottom: 28,
    left: 56,
    right: 56,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: "#b3b3b3",
  },
});

/** Inline **bold** runs. */
function renderInline(text: string, keyPrefix: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter((p) => p !== "");
  return parts.map((part, i) => {
    const bold = part.match(/^\*\*([^*]+)\*\*$/);
    return bold ? (
      <Text key={`${keyPrefix}-${i}`} style={styles.bold}>
        {bold[1]}
      </Text>
    ) : (
      <Text key={`${keyPrefix}-${i}`}>{part}</Text>
    );
  });
}

const CHART_EMBED = /^!\[[^\]]*\]\(\/api\/charts\/([0-9a-f-]+)\)\s*$/i;
/** A cell that reads as a number/money (incl. `+$96`, `-$1.28`, `(123)`) →
 *  right-align it in the table. */
const NUMERICISH = /^[-+(]?\$?[\d.,]/;

type Block =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "bullets"; items: string[] }
  | { type: "table"; header: string[]; rows: string[][] }
  | { type: "chart"; id: string }
  | { type: "divider" };

const isSeparatorRow = (line: string) =>
  /^\|?[\s:|-]+\|[\s:|-]*$/.test(line) && line.includes("-");
const splitRow = (line: string) =>
  line.replace(/^\||\|$/g, "").split("|").map((c) => c.trim());

/** Parse light markdown into renderable blocks (headings, paragraphs, bullets,
 *  tables, chart embeds, dividers). */
function parseBlocks(body: string): Block[] {
  // Repair single-line/collapsed tables first so the row detection below works.
  const lines = reflowCollapsedTables(body.replace(/\r/g, "")).split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  let bullets: string[] = [];
  let table: string[][] | null = null;
  const flushPara = () => {
    if (para.length) blocks.push({ type: "paragraph", text: para.join(" ").trim() });
    para = [];
  };
  const flushBullets = () => {
    if (bullets.length) blocks.push({ type: "bullets", items: bullets });
    bullets = [];
  };
  const flushTable = () => {
    if (table && table.length) {
      const [header, ...rows] = table;
      blocks.push({ type: "table", header, rows });
    }
    table = null;
  };
  const flushAll = () => {
    flushPara();
    flushBullets();
    flushTable();
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (line === "") {
      flushAll();
      continue;
    }
    // A GFM table row (but not the |---| separator, which just closes the head).
    if (line.startsWith("|") && line.endsWith("|")) {
      if (isSeparatorRow(line)) continue;
      flushPara();
      flushBullets();
      (table ??= []).push(splitRow(line));
      continue;
    }
    flushTable();
    // Horizontal rule.
    if (/^([-*_])\1{2,}$/.test(line)) {
      flushPara();
      flushBullets();
      blocks.push({ type: "divider" });
      continue;
    }
    // Chart embed → render natively (never as raw markdown text).
    const chart = line.match(CHART_EMBED);
    if (chart) {
      flushPara();
      flushBullets();
      blocks.push({ type: "chart", id: chart[1] });
      continue;
    }
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (heading) {
      flushPara();
      flushBullets();
      blocks.push({ type: "heading", text: heading[1].replace(/\*\*/g, "").trim() });
      continue;
    }
    const bullet = line.match(/^[-*]\s+(.*)$/);
    if (bullet) {
      flushPara();
      bullets.push(bullet[1]);
      continue;
    }
    flushBullets();
    para.push(line);
  }
  flushAll();
  return blocks;
}

/** A horizontal diverging bar chart drawn with native PDF primitives, from the
 *  stored chart spec. Positive bars grow right (green), negative left (red). */
function ChartBlock({ spec }: { spec: ChartSpec }) {
  const fmt = fmtFn(spec.unit);
  const data = spec.data.filter((d) => typeof d.value === "number");
  const maxAbs = Math.max(1, ...data.map((d) => Math.abs(d.value as number)));
  const anyNeg = data.some((d) => (d.value as number) < 0);
  return (
    <View style={{ marginBottom: 12 }} wrap={false}>
      <Text style={styles.chartTitle}>{spec.title}</Text>
      {spec.subtitle ? <Text style={styles.chartSub}>{spec.subtitle}</Text> : null}
      {data.map((d, i) => {
        const v = d.value as number;
        const pct = Math.min(1, Math.abs(v) / maxAbs);
        const pos = v >= 0;
        return (
          <View key={i} style={styles.chartRow} wrap={false}>
            <Text style={styles.chartLabel}>{d.label}</Text>
            <View style={styles.chartTrack}>
              {/* left half (negatives grow leftward from the centre) */}
              {anyNeg ? (
                <View style={[styles.chartHalf, { justifyContent: "flex-end" }]}>
                  {!pos && (
                    <View
                      style={{ width: `${pct * 100}%`, height: 9, backgroundColor: NEG, borderRadius: 1.5 }}
                    />
                  )}
                </View>
              ) : null}
              {/* right half (positives grow rightward) */}
              <View style={[styles.chartHalf, { justifyContent: "flex-start" }]}>
                {pos && (
                  <View
                    style={{
                      width: `${pct * 100}%`,
                      height: 9,
                      backgroundColor: POS,
                      borderRadius: 1.5,
                    }}
                  />
                )}
              </View>
            </View>
            <Text style={[styles.chartVal, { color: pos ? POS : NEG }]}>{fmt(v)}</Text>
          </View>
        );
      })}
    </View>
  );
}

function TableBlock({ header, rows }: { header: string[]; rows: string[][] }) {
  const cols = header.length;
  return (
    <View style={styles.table}>
      <View style={styles.trHead} wrap={false}>
        {header.map((h, i) => (
          <Text key={i} style={styles.th}>
            {h}
          </Text>
        ))}
      </View>
      {rows.map((r, ri) => (
        <View
          key={ri}
          style={ri === rows.length - 1 ? [styles.tr, { borderBottomWidth: 0 }] : styles.tr}
          wrap={false}
        >
          {Array.from({ length: cols }).map((_, ci) => {
            const cell = r[ci] ?? "";
            const align = ci > 0 && NUMERICISH.test(cell) ? "right" : "left";
            return (
              <Text key={ci} style={[styles.td, { textAlign: align }]}>
                {renderInline(cell, `t${ri}-${ci}`)}
              </Text>
            );
          })}
        </View>
      ))}
    </View>
  );
}

export async function renderMarkdownReportPdf(opts: {
  title: string;
  body: string;
  subtitle?: string;
  createdAt: Date;
}): Promise<Buffer> {
  let blocks = parseBlocks(opts.body);

  // Drop a leading H1 that just repeats the report title (avoids showing it
  // twice — once as the PDF title, once in the body).
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  if (blocks[0]?.type === "heading" && norm(blocks[0].text) === norm(opts.title))
    blocks = blocks.slice(1);

  // Resolve chart specs (one DB read per referenced chart).
  const chartIds = [...new Set(blocks.flatMap((b) => (b.type === "chart" ? [b.id] : [])))];
  const specs = new Map<string, ChartSpec>();
  await Promise.all(
    chartIds.map(async (id) => {
      try {
        const [row] = await db.select().from(charts).where(eq(charts.id, id));
        if (row?.spec) specs.set(id, row.spec as ChartSpec);
      } catch {
        // a missing/deleted chart just renders nothing
      }
    }),
  );

  const when = opts.createdAt.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const doc = (
    <Document title={`apOS report — ${opts.title.slice(0, 60)}`} author="apOS">
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow} fixed>
          <Text style={styles.eyebrow}>apOS · Report</Text>
          <View>
            <Text style={styles.meta}>{when}</Text>
            {opts.subtitle ? <Text style={styles.meta}>{opts.subtitle}</Text> : null}
          </View>
        </View>
        <Text style={styles.title}>{opts.title}</Text>
        {blocks.map((b, i) => {
          if (b.type === "heading")
            return (
              <Text key={i} style={styles.heading}>
                {b.text}
              </Text>
            );
          if (b.type === "divider") return <View key={i} style={styles.divider} />;
          if (b.type === "table")
            return <TableBlock key={i} header={b.header} rows={b.rows} />;
          if (b.type === "chart") {
            const spec = specs.get(b.id);
            return spec ? <ChartBlock key={i} spec={spec} /> : null;
          }
          if (b.type === "bullets")
            return (
              <View key={i} style={{ marginBottom: 8 }}>
                {b.items.map((it, j) => (
                  <View key={j} style={styles.bulletRow} wrap={false}>
                    <Text style={styles.bulletDot}>•</Text>
                    <Text style={styles.bulletText}>{renderInline(it, `b${i}-${j}`)}</Text>
                  </View>
                ))}
              </View>
            );
          return (
            <Text key={i} style={styles.paragraph}>
              {renderInline(b.text, `p${i}`)}
            </Text>
          );
        })}
        <View style={styles.footer} fixed>
          <Text>Generated by apOS</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
  return renderToBuffer(doc);
}
