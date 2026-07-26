/**
 * Best-effort text extraction from an uploaded file, keyed by extension/mime.
 * Worker-safe (no server-only imports). Anything we can't parse is marked
 * "unsupported" — the file is still kept and downloadable, just not searchable.
 */
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";

export interface ExtractResult {
  text: string | null;
  status: "ready" | "unsupported" | "error";
  detail?: string;
}

// Extensions we trust to be plain text without sniffing.
const TEXT_EXTENSIONS = new Set([
  "txt", "md", "markdown", "csv", "tsv", "json", "yaml", "yml", "log",
  "ts", "tsx", "js", "jsx", "py", "rb", "go", "rs", "java", "c", "cpp",
  "h", "hpp", "html", "htm", "xml", "css", "sql", "sh", "toml", "ini", "conf",
]);

function extOf(filename: string): string {
  const m = filename.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
}

/** Cheap heuristic for unknown extensions: mostly-printable bytes → treat as text. */
function looksLikeText(buf: Buffer): boolean {
  const sample = buf.subarray(0, 2000);
  if (sample.length === 0) return true;
  let printable = 0;
  for (const b of sample) {
    if (b === 9 || b === 10 || b === 13 || (b >= 32 && b < 127) || b >= 128) printable++;
  }
  return printable / sample.length > 0.9;
}

// Cap kept consistent with how the rest of the app embeds a single vector per
// row (knowledge/notes/vault) rather than chunking a document into many.
const MAX_EXTRACT_CHARS = 20_000;

export async function extractText(
  filename: string,
  mimeType: string | null,
  buf: Buffer,
): Promise<ExtractResult> {
  const ext = extOf(filename);
  try {
    if (ext === "pdf" || mimeType === "application/pdf") {
      const parser = new PDFParse({ data: buf });
      try {
        const result = await parser.getText();
        return { text: result.text.slice(0, MAX_EXTRACT_CHARS), status: "ready" };
      } finally {
        await parser.destroy();
      }
    }
    if (
      ext === "docx" ||
      mimeType ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      const { value } = await mammoth.extractRawText({ buffer: buf });
      return { text: value.slice(0, MAX_EXTRACT_CHARS), status: "ready" };
    }
    if (TEXT_EXTENSIONS.has(ext) || looksLikeText(buf)) {
      return { text: buf.toString("utf8").slice(0, MAX_EXTRACT_CHARS), status: "ready" };
    }
    return {
      text: null,
      status: "unsupported",
      detail: `no text extractor for ".${ext || "unknown"}" — kept as a plain attachment`,
    };
  } catch (e) {
    return { text: null, status: "error", detail: String(e).slice(0, 300) };
  }
}
