import * as echarts from "echarts";
import { buildChartOption, type ChartSpec } from "./chartOption";

export type { ChartSpec } from "./chartOption";

/**
 * Server-side SVG render of a chart via ECharts SSR (light theme) — used for the
 * standalone /api/charts/<id> image and PDF export. The interactive in-chat
 * version renders the same spec client-side (dark theme); see ChartEmbed.
 */
export function renderChartSvg(spec: ChartSpec): string {
  const width = spec.width ?? 640;
  const height =
    spec.height ??
    (spec.type === "hbar"
      ? Math.max(240, spec.data.length * 34 + 96)
      : spec.type === "pie" || spec.type === "donut" || spec.type === "treemap"
        ? 380
        : 400);
  const chart = echarts.init(null, null, { renderer: "svg", ssr: true, width, height });
  chart.setOption(buildChartOption(spec, false) as echarts.EChartsCoreOption);
  const svg = chart.renderToSVGString();
  chart.dispose();
  return svg;
}
