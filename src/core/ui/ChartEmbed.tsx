"use client";

import { useEffect, useRef, useState } from "react";
import { buildChartOption, type ChartSpec } from "@/core/viz/chartOption";

/**
 * Renders a viz.chart INTERACTIVELY in-place (hover tooltips, zoom, legend
 * toggles) by fetching its spec (/api/charts/<id>?spec=1) and mounting ECharts
 * client-side (lazy-loaded). Falls back to the static SVG image if the spec
 * isn't available (e.g. an older chart) or ECharts fails to load.
 */
export function ChartEmbed({ src }: { src: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [height, setHeight] = useState(340);

  useEffect(() => {
    let disposed = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let chart: any;
    let onResize: (() => void) | undefined;
    (async () => {
      try {
        const specUrl = src + (src.includes("?") ? "&" : "?") + "spec=1";
        const res = await fetch(specUrl);
        if (!res.ok) throw new Error("no spec");
        const spec = (await res.json()) as ChartSpec;
        const h =
          spec.type === "hbar"
            ? Math.max(300, spec.data.length * 30 + 96)
            : spec.type === "pie" || spec.type === "donut" || spec.type === "treemap"
              ? 320
              : 340;
        if (disposed) return;
        setHeight(h);
        const echarts = await import("echarts");
        if (disposed || !ref.current) return;
        chart = echarts.init(ref.current, null, { renderer: "canvas" });
        chart.setOption(buildChartOption(spec, true));
        onResize = () => chart?.resize();
        window.addEventListener("resize", onResize);
      } catch {
        if (!disposed) setFailed(true);
      }
    })();
    return () => {
      disposed = true;
      if (onResize) window.removeEventListener("resize", onResize);
      if (chart) chart.dispose();
    };
  }, [src]);

  if (failed)
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt="chart"
        className="my-2 max-w-full rounded-lg border border-white/10 bg-white"
      />
    );

  return (
    <div
      ref={ref}
      className="my-2 w-full rounded-lg border border-white/10"
      style={{ height }}
    />
  );
}
