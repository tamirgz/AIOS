/**
 * Dependency-free server-side SVG chart generator — so a headless agent (or the
 * chat) can turn data into a real chart without a browser or canvas. Output is a
 * self-contained <svg> string: embeddable inline (markdown image / note), saved
 * as a file, or dropped into a report. Supports the shapes portfolio work needs:
 * vertical bars, horizontal bars (long labels / many rows), lines, and pies.
 */
export interface ChartSpec {
  type: "bar" | "hbar" | "line" | "pie";
  title: string;
  subtitle?: string;
  data: { label: string; value: number }[];
  /** number formatting for values/axes. */
  unit?: "number" | "currency" | "percent";
  width?: number;
  height?: number;
}

const PALETTE = [
  "#2a78d6", "#eb6834", "#1baf7a", "#eda100",
  "#e87ba4", "#008300", "#4a3aa7", "#e34948",
];
const POS = "#0ca30c";
const NEG = "#d03b3b";
const INK = "#1a1a19";
const MUTED = "#6b6a66";
const GRID = "#e5e4de";

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

function fmt(v: number, unit: ChartSpec["unit"]): string {
  const r = Math.round(v * 100) / 100;
  if (unit === "currency") {
    const s = Math.abs(r) >= 1000 ? Math.round(r).toLocaleString("en-US") : String(r);
    return (r < 0 ? "-$" : "$") + s.replace("-", "");
  }
  if (unit === "percent") return `${r}%`;
  return Math.abs(r) >= 1000 ? Math.round(r).toLocaleString("en-US") : String(r);
}

const trunc = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

function frame(w: number, h: number, spec: ChartSpec, body: string): string {
  const title = `<text x="16" y="26" font-size="15" font-weight="600" fill="${INK}">${esc(trunc(spec.title, 64))}</text>`;
  const sub = spec.subtitle
    ? `<text x="16" y="44" font-size="12" fill="${MUTED}">${esc(trunc(spec.subtitle, 80))}</text>`
    : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="ui-sans-serif,system-ui,Arial,sans-serif" role="img" aria-label="${esc(spec.title)}">` +
    `<rect width="${w}" height="${h}" rx="12" fill="#ffffff"/>` +
    title + sub + body +
    `</svg>`
  );
}

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

function barChart(spec: ChartSpec, horizontal: boolean): string {
  const w = spec.width ?? 640;
  const h = spec.height ?? (horizontal ? Math.max(220, spec.data.length * 26 + 90) : 400);
  const top = spec.subtitle ? 60 : 48;
  const data = spec.data;
  const vals = data.map((d) => d.value);
  const rawMax = Math.max(0, ...vals);
  const rawMin = Math.min(0, ...vals);
  const anyNeg = rawMin < 0;
  const color = (v: number) => (anyNeg ? (v >= 0 ? POS : NEG) : PALETTE[0]);
  let out = "";

  if (horizontal) {
    const L = 96, R = 24, plotW = w - L - R;
    const span = niceMax(Math.max(Math.abs(rawMax), Math.abs(rawMin))) * (anyNeg ? 1 : 1);
    const min = anyNeg ? -span : 0;
    const max = span;
    const x = (v: number) => L + ((v - min) / (max - min)) * plotW;
    const rowH = (h - top - 24) / data.length;
    const bh = Math.min(20, rowH * 0.66);
    const zeroX = x(0);
    out += `<line x1="${zeroX.toFixed(1)}" y1="${top}" x2="${zeroX.toFixed(1)}" y2="${(h - 24).toFixed(1)}" stroke="${GRID}"/>`;
    data.forEach((d, i) => {
      const cy = top + rowH * i + rowH / 2;
      const bx = Math.min(zeroX, x(d.value));
      const bw = Math.abs(x(d.value) - zeroX);
      out += `<rect x="${bx.toFixed(1)}" y="${(cy - bh / 2).toFixed(1)}" width="${Math.max(1, bw).toFixed(1)}" height="${bh.toFixed(1)}" rx="3" fill="${color(d.value)}"/>`;
      out += `<text x="${(L - 8).toFixed(1)}" y="${(cy + 4).toFixed(1)}" font-size="11.5" text-anchor="end" fill="${MUTED}">${esc(trunc(d.label, 12))}</text>`;
      const lx = d.value >= 0 ? x(d.value) + 5 : x(d.value) - 5;
      const anchor = d.value >= 0 ? "start" : "end";
      out += `<text x="${lx.toFixed(1)}" y="${(cy + 4).toFixed(1)}" font-size="11" text-anchor="${anchor}" fill="${INK}">${esc(fmt(d.value, spec.unit))}</text>`;
    });
    return frame(w, h, spec, out);
  }

  // vertical bars
  const L = 52, R = 16, B = 52;
  const plotW = w - L - R, plotH = h - top - B;
  const max = niceMax(rawMax) || 1;
  const min = anyNeg ? -(niceMax(Math.abs(rawMin)) || 1) : 0;
  const y = (v: number) => top + plotH - ((v - min) / (max - min)) * plotH;
  const zeroY = y(0);
  [min, (min + max) / 2, max].forEach((gv) => {
    const gy = y(gv);
    out += `<line x1="${L}" y1="${gy.toFixed(1)}" x2="${w - R}" y2="${gy.toFixed(1)}" stroke="${GRID}"/>`;
    out += `<text x="${L - 6}" y="${(gy + 4).toFixed(1)}" font-size="10.5" text-anchor="end" fill="${MUTED}">${esc(fmt(gv, spec.unit))}</text>`;
  });
  const slot = plotW / data.length;
  const bw = Math.min(28, slot * 0.66);
  data.forEach((d, i) => {
    const cx = L + slot * i + slot / 2;
    const vy = y(d.value);
    const barTop = Math.min(zeroY, vy);
    const barH = Math.abs(vy - zeroY);
    out += `<rect x="${(cx - bw / 2).toFixed(1)}" y="${barTop.toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(1, barH).toFixed(1)}" rx="3" fill="${color(d.value)}"/>`;
    out += `<text x="${cx.toFixed(1)}" y="${(h - 32).toFixed(1)}" font-size="10.5" text-anchor="middle" fill="${MUTED}">${esc(trunc(d.label, 8))}</text>`;
  });
  return frame(w, h, spec, out);
}

function lineChart(spec: ChartSpec): string {
  const w = spec.width ?? 640, h = spec.height ?? 400;
  const top = spec.subtitle ? 60 : 48;
  const L = 56, R = 16, B = 52;
  const data = spec.data;
  const plotW = w - L - R, plotH = h - top - B;
  const vals = data.map((d) => d.value);
  const max = niceMax(Math.max(...vals)) || 1;
  const min = Math.min(0, ...vals);
  const y = (v: number) => top + plotH - ((v - min) / (max - min)) * plotH;
  const x = (i: number) => L + (data.length === 1 ? plotW / 2 : (i / (data.length - 1)) * plotW);
  let out = "";
  [min, (min + max) / 2, max].forEach((gv) => {
    const gy = y(gv);
    out += `<line x1="${L}" y1="${gy.toFixed(1)}" x2="${w - R}" y2="${gy.toFixed(1)}" stroke="${GRID}"/>`;
    out += `<text x="${L - 6}" y="${(gy + 4).toFixed(1)}" font-size="10.5" text-anchor="end" fill="${MUTED}">${esc(fmt(gv, spec.unit))}</text>`;
  });
  const pts = data.map((d, i) => `${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(" ");
  out += `<polyline points="${pts}" fill="none" stroke="${PALETTE[0]}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
  const step = Math.ceil(data.length / 8);
  data.forEach((d, i) => {
    if (i % step === 0 || i === data.length - 1)
      out += `<text x="${x(i).toFixed(1)}" y="${(h - 32).toFixed(1)}" font-size="10" text-anchor="middle" fill="${MUTED}">${esc(trunc(d.label, 10))}</text>`;
  });
  return frame(w, h, spec, out);
}

function pieChart(spec: ChartSpec): string {
  const w = spec.width ?? 640, h = spec.height ?? 360;
  const top = spec.subtitle ? 60 : 48;
  const data = spec.data.filter((d) => d.value > 0);
  const total = data.reduce((a, d) => a + d.value, 0) || 1;
  const cx = 150, cy = top + (h - top) / 2, r = Math.min(120, (h - top) / 2 - 10);
  let ang = -Math.PI / 2;
  let out = "";
  data.forEach((d, i) => {
    const frac = d.value / total;
    const a2 = ang + frac * Math.PI * 2;
    const large = frac > 0.5 ? 1 : 0;
    const x1 = cx + r * Math.cos(ang), y1 = cy + r * Math.sin(ang);
    const x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2);
    out += `<path d="M${cx} ${cy} L${x1.toFixed(1)} ${y1.toFixed(1)} A${r} ${r} 0 ${large} 1 ${x2.toFixed(1)} ${y2.toFixed(1)} Z" fill="${PALETTE[i % PALETTE.length]}"/>`;
    ang = a2;
  });
  const lx = cx + r + 32;
  data.forEach((d, i) => {
    const ly = top + 8 + i * 20;
    const pct = Math.round((d.value / total) * 100);
    out += `<rect x="${lx}" y="${ly - 9}" width="11" height="11" rx="2" fill="${PALETTE[i % PALETTE.length]}"/>`;
    out += `<text x="${lx + 18}" y="${ly}" font-size="11.5" fill="${INK}">${esc(trunc(d.label, 16))} · ${pct}%</text>`;
  });
  return frame(w, h, spec, out);
}

export function renderChartSvg(spec: ChartSpec): string {
  if (!spec.data?.length) return frame(spec.width ?? 640, 120, spec, `<text x="16" y="80" font-size="12" fill="${MUTED}">no data</text>`);
  switch (spec.type) {
    case "hbar":
      return barChart(spec, true);
    case "line":
      return lineChart(spec);
    case "pie":
      return pieChart(spec);
    case "bar":
    default:
      return barChart(spec, false);
  }
}
