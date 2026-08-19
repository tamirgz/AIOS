/**
 * Renders an Ask answer as a structured, printable PDF report — a real
 * downloadable file (not a browser print dialog), so it can be saved, shared
 * or attached. Server-only: @react-pdf/renderer is Node-targeted and heavy,
 * so this is imported only from the PDF route handler, never the client.
 */
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { AskSource } from "./schema";

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
  question: {
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
  cite: { fontSize: 7, color: "#6d5ae0", fontFamily: "Helvetica-Bold" },
  bold: { fontFamily: "Helvetica-Bold" },
  sourcesTitle: {
    fontSize: 8,
    letterSpacing: 2,
    color: "#8a8a8a",
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    marginTop: 22,
    marginBottom: 8,
    borderTopWidth: 1,
    borderTopColor: "#e2e2e2",
    paddingTop: 12,
  },
  sourceRow: { flexDirection: "row", marginBottom: 5, alignItems: "flex-start" },
  sourceNum: {
    width: 18,
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#6d5ae0",
  },
  sourceBody: { flex: 1 },
  sourceTitle: { fontSize: 9.5, color: "#1a1a1a" },
  sourceKind: { fontSize: 7, color: "#9a9a9a", textTransform: "uppercase", letterSpacing: 1 },
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

/** Inline runs: **bold** and [n] citation superscripts. */
function renderInline(text: string, keyPrefix: string) {
  // Split on either **bold** or [n], keeping the delimiters.
  const parts = text.split(/(\*\*[^*]+\*\*|\[\d+\])/g).filter((p) => p !== "");
  return parts.map((part, i) => {
    const cite = part.match(/^\[(\d+)\]$/);
    if (cite) {
      return (
        <Text key={`${keyPrefix}-${i}`} style={styles.cite}>
          {" "}
          [{cite[1]}]
        </Text>
      );
    }
    const bold = part.match(/^\*\*([^*]+)\*\*$/);
    if (bold) {
      return (
        <Text key={`${keyPrefix}-${i}`} style={styles.bold}>
          {bold[1]}
        </Text>
      );
    }
    return <Text key={`${keyPrefix}-${i}`}>{part}</Text>;
  });
}

type Block =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "bullets"; items: string[] };

/** Parse the model's light-markdown answer into renderable blocks. */
function parseBlocks(answer: string): Block[] {
  const lines = answer.replace(/\r/g, "").split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  let bullets: string[] = [];

  const flushPara = () => {
    if (para.length) {
      blocks.push({ type: "paragraph", text: para.join(" ").trim() });
      para = [];
    }
  };
  const flushBullets = () => {
    if (bullets.length) {
      blocks.push({ type: "bullets", items: bullets });
      bullets = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (line === "") {
      flushPara();
      flushBullets();
      continue;
    }
    const heading = line.match(/^#{1,6}\s+(.*)$/);
    if (heading) {
      flushPara();
      flushBullets();
      blocks.push({ type: "heading", text: heading[1] });
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

export async function renderAskReportPdf(entry: {
  query: string;
  answer: string;
  sources: AskSource[];
  model: string | null;
  createdAt: Date;
}): Promise<Buffer> {
  const blocks = parseBlocks(entry.answer);
  const when = entry.createdAt.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });

  const doc = (
    <Document
      title={`apOS report — ${entry.query.slice(0, 60)}`}
      author="apOS"
      creator="apOS Ask"
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow} fixed>
          <Text style={styles.eyebrow}>apOS · Knowledge Report</Text>
          <View>
            <Text style={styles.meta}>{when}</Text>
            {entry.model ? <Text style={styles.meta}>{entry.model}</Text> : null}
          </View>
        </View>

        <Text style={styles.question}>{entry.query}</Text>

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
                    <Text style={styles.bulletText}>
                      {renderInline(it, `b${i}-${j}`)}
                    </Text>
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

        {entry.sources.length > 0 && (
          <View>
            <Text style={styles.sourcesTitle}>
              Sources · {entry.sources.length}
            </Text>
            {entry.sources.map((s) => (
              <View key={s.n} style={styles.sourceRow} wrap={false}>
                <Text style={styles.sourceNum}>[{s.n}]</Text>
                <View style={styles.sourceBody}>
                  <Text style={styles.sourceTitle}>{s.title}</Text>
                  <Text style={styles.sourceKind}>{s.kind}</Text>
                </View>
              </View>
            ))}
          </View>
        )}

        <View style={styles.footer} fixed>
          <Text>Generated by apOS — answered only from your own saved data.</Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `${pageNumber} / ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );

  return renderToBuffer(doc);
}
