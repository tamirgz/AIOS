/**
 * Generic markdown → PDF report renderer. Server-only (@react-pdf/renderer is
 * Node-targeted). Turns a title + light-markdown body into a clean, downloadable
 * A4 report — used by the chat "export as PDF" action and reusable anywhere.
 */
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import { reflowCollapsedTables } from "@/core/ui/reflowTables";

const styles = StyleSheet.create({
  page: {
    paddingTop: 54,
    paddingBottom: 56,
    paddingHorizontal: 56,
    fontSize: 10.5,
    lineHeight: 1.5,
    color: "#1a1a1a",
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
    marginTop: 12,
    marginBottom: 5,
  },
  paragraph: { marginBottom: 8 },
  bulletRow: { flexDirection: "row", marginBottom: 3, paddingLeft: 6 },
  bulletDot: { width: 12, fontFamily: "Helvetica-Bold", color: "#555" },
  bulletText: { flex: 1 },
  bold: { fontFamily: "Helvetica-Bold" },
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

type Block =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "bullets"; items: string[] };

/** Parse light markdown into renderable blocks (headings, paragraphs, bullets).
 *  Markdown tables are flattened to bullet rows so they don't break layout. */
function parseBlocks(body: string): Block[] {
  // Repair single-line/collapsed tables first, otherwise the line-by-line
  // parser below flattens the whole table into one giant bullet.
  const lines = reflowCollapsedTables(body.replace(/\r/g, "")).split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  let bullets: string[] = [];
  const flushPara = () => {
    if (para.length) blocks.push({ type: "paragraph", text: para.join(" ").trim() });
    para = [];
  };
  const flushBullets = () => {
    if (bullets.length) blocks.push({ type: "bullets", items: bullets });
    bullets = [];
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (line === "") {
      flushPara();
      flushBullets();
      continue;
    }
    // table separator row (|---|---|) — skip
    if (/^\|?[\s:|-]+\|[\s:|-]*$/.test(line) && line.includes("-")) continue;
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (heading) {
      flushPara();
      flushBullets();
      blocks.push({ type: "heading", text: heading[1].replace(/\*\*/g, "") });
      continue;
    }
    // table row → bullet of "cell · cell · cell"
    if (line.startsWith("|") && line.endsWith("|")) {
      flushPara();
      const cells = line
        .slice(1, -1)
        .split("|")
        .map((c) => c.trim())
        .filter(Boolean);
      if (cells.length) bullets.push(cells.join("  ·  "));
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
  flushPara();
  flushBullets();
  return blocks;
}

export async function renderMarkdownReportPdf(opts: {
  title: string;
  body: string;
  subtitle?: string;
  createdAt: Date;
}): Promise<Buffer> {
  const blocks = parseBlocks(opts.body);
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
