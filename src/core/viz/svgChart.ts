import * as echarts from "echarts";

/**
 * High-quality server-side chart rendering via Apache ECharts' SSR mode
 * (renderer:"svg", ssr:true) — real charting-library output as a self-contained
 * <svg> string, no browser or canvas. Same interface as before so viz.chart is
 * unchanged. Supports vertical/horizontal bars, lines, and pies.
 */
export interface ChartSpec {
  type: "bar" | "hbar" | "line" | "pie";
  title: string;
  subtitle?: string;
  data: { label: string; value: number }[];
  unit?: "number" | "currency" | "percent";
  width?: number;
  height?: number;
}

const PALETTE = [
  "#2a78d6", "#eb6834", "#1baf7a", "#eda100",
  "#e87ba4", "#008300", "#4a3aa7", "#e34948",
];
const INK = "#1a1a19";
const MUTED = "#6b6a66";
const GRID = "#ececE6";
const POS = "#0ca30c";
const NEG = "#d03b3b";
const BLUE = "#2a78d6";
const FONT = "ui-sans-serif,system-ui,-apple-system,Segoe UI,Arial,sans-serif";

function fmtFn(unit?: string) {
  return (raw: number) => {
    const v = Math.round((Number(raw) + Number.EPSILON) * 100) / 100;
    if (unit === "currency") {
      const big = Math.abs(v) >= 1000;
      const n = (big ? Math.round(Math.abs(v)) : Math.abs(v)).toLocaleString("en-US");
      return (v < 0 ? "-$" : "$") + n;
    }
    if (unit === "percent") return `${v}%`;
    return Math.abs(v) >= 1000 ? Math.round(v).toLocaleString("en-US") : String(v);
  };
}

function base(spec: ChartSpec, extra: Record<string, unknown>) {
  return {
    backgroundColor: "#ffffff",
    textStyle: { fontFamily: FONT },
    title: {
      text: spec.title,
      subtext: spec.subtitle,
      left: 20,
      top: 14,
      textStyle: { fontSize: 15, fontWeight: 600, color: INK, fontFamily: FONT },
      subtextStyle: { fontSize: 12, color: MUTED, fontFamily: FONT },
    },
    ...extra,
  };
}

function barOption(spec: ChartSpec, horizontal: boolean) {
  const f = fmtFn(spec.unit);
  const labels = spec.data.map((d) => d.label);
  const anyNeg = spec.data.some((d) => d.value < 0);
  const bars = spec.data.map((d) => ({
    value: d.value,
    itemStyle: {
      color: anyNeg ? (d.value >= 0 ? POS : NEG) : BLUE,
      borderRadius: horizontal ? [0, 3, 3, 0] : [3, 3, 0, 0],
    },
  }));
  const cat = {
    type: "category" as const,
    data: labels,
    axisLabel: { color: MUTED, fontSize: 11 },
    axisLine: { lineStyle: { color: GRID } },
    axisTick: { show: false },
  };
  const val = {
    type: "value" as const,
    axisLabel: { color: MUTED, fontSize: 11, formatter: f },
    splitLine: { lineStyle: { color: GRID } },
    axisLine: { show: false },
  };
  return base(spec, {
    grid: horizontal
      ? { left: 104, right: 64, top: spec.subtitle ? 76 : 58, bottom: 28 }
      : { left: 66, right: 26, top: spec.subtitle ? 76 : 58, bottom: 42 },
    xAxis: horizontal ? val : cat,
    yAxis: horizontal ? { ...cat, inverse: true } : val,
    series: [
      {
        type: "bar",
        data: bars,
        barMaxWidth: 26,
        label: {
          show: true,
          position: horizontal ? "right" : "top",
          color: MUTED,
          fontSize: 10,
          formatter: (p: { value: number }) => f(p.value),
        },
      },
    ],
  });
}

function lineOption(spec: ChartSpec) {
  const f = fmtFn(spec.unit);
  return base(spec, {
    grid: { left: 66, right: 26, top: spec.subtitle ? 76 : 58, bottom: 40 },
    xAxis: {
      type: "category",
      data: spec.data.map((d) => d.label),
      boundaryGap: false,
      axisLabel: { color: MUTED, fontSize: 10 },
      axisLine: { lineStyle: { color: GRID } },
      axisTick: { show: false },
    },
    yAxis: {
      type: "value",
      scale: true,
      axisLabel: { color: MUTED, fontSize: 11, formatter: f },
      splitLine: { lineStyle: { color: GRID } },
      axisLine: { show: false },
    },
    series: [
      {
        type: "line",
        data: spec.data.map((d) => d.value),
        smooth: true,
        symbol: "none",
        lineStyle: { width: 2, color: BLUE },
        areaStyle: { color: "rgba(42,120,214,0.10)" },
      },
    ],
  });
}

function pieOption(spec: ChartSpec) {
  const items = spec.data.filter((d) => d.value > 0);
  const total = items.reduce((a, d) => a + d.value, 0) || 1;
  const data = items.map((d, i) => ({
    name: d.label,
    value: d.value,
    itemStyle: { color: PALETTE[i % PALETTE.length] },
  }));
  return base(spec, {
    legend: {
      type: "scroll",
      orient: "vertical",
      right: 16,
      top: "middle",
      textStyle: { color: INK, fontSize: 11, fontFamily: FONT },
      itemWidth: 12,
      itemHeight: 12,
      formatter: (name: string) => {
        const it = items.find((d) => d.label === name);
        return it ? `${name}  ${Math.round((it.value / total) * 100)}%` : name;
      },
    },
    series: [
      {
        type: "pie",
        radius: ["42%", "70%"],
        center: ["34%", "56%"],
        data,
        label: { show: false },
        labelLine: { show: false },
        emphasis: { scale: false },
      },
    ],
  });
}

export function renderChartSvg(spec: ChartSpec): string {
  const width = spec.width ?? 640;
  const height =
    spec.height ??
    (spec.type === "hbar"
      ? Math.max(240, spec.data.length * 34 + 96)
      : spec.type === "pie"
        ? 380
        : 400);
  const chart = echarts.init(null, null, {
    renderer: "svg",
    ssr: true,
    width,
    height,
  });
  const option =
    spec.type === "hbar"
      ? barOption(spec, true)
      : spec.type === "line"
        ? lineOption(spec)
        : spec.type === "pie"
          ? pieOption(spec)
          : barOption(spec, false);
  chart.setOption(option as echarts.EChartsCoreOption);
  const svg = chart.renderToSVGString();
  chart.dispose();
  return svg;
}
