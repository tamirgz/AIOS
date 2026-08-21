import { z } from "zod";
import type { AiToolDef } from "@/core/modules/types.server";

/**
 * Market-data tools over iSentry's self-hosted Flask price service
 * (n8ntg.vps.webdock.cloud/flask, wrapping yfinance). Read-only, external. The
 * service is unauthenticated + single-node/best-effort, so every call has a
 * timeout and degrades to an error result rather than throwing.
 *
 * Conventions the service imposes (Appendix F of the iSentry data-access map):
 *  - Yahoo symbols: TASE = "<sym>.TA", indices = "^GSPC" / "^IXIC".
 *  - .TA prices come back in AGOROT (currency "ILA") → divide by 100 for ILS.
 *  - responses can contain literal NaN tokens (invalid JSON) → sanitize first.
 *  - history bar keys may be lower- or upper-cased.
 */
// Host root — the endpoint paths carry the `/flask` prefix themselves, so strip
// a trailing `/flask` if the env var includes it (avoids a double /flask/flask).
const BASE = (process.env.MARKET_API_URL || "https://n8ntg.vps.webdock.cloud")
  .replace(/\/$/, "")
  .replace(/\/flask$/, "");

const EXCHANGE: Record<string, string> = {
  NMS: "NASDAQ", NGM: "NASDAQ", NAS: "NASDAQ", NCM: "NASDAQ",
  NYQ: "NYSE", PCX: "AMEX", TLV: "TASE", LON: "LSE", LSE: "LSE",
  AMS: "EURONEXT", OQX: "OTC", BTS: "CBOE", CCC: "Crypto",
};

const num = (v: unknown): number | null =>
  v == null || !Number.isFinite(Number(v)) ? null : Number(v);

async function flaskGet(path: string, params: Record<string, string>) {
  const url = `${BASE}${path}?${new URLSearchParams(params)}`;
  // The service is single-node/best-effort and returns transient 500s (e.g. a
  // cold worker warming up), so retry a couple of times with backoff.
  let lastErr = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 700 * attempt));
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "apOS" },
        signal: AbortSignal.timeout(25_000),
      });
      if (!res.ok) {
        lastErr = `${path} → ${res.status}`;
        if (res.status >= 500) continue; // transient — retry
        throw new Error(`market ${lastErr}`);
      }
      // NaN → null so JSON.parse doesn't choke.
      const text = (await res.text()).replace(/:\s*NaN/g, ": null");
      return JSON.parse(text) as unknown;
    } catch (e) {
      lastErr = String(e);
    }
  }
  throw new Error(`market ${lastErr}`);
}

interface Bar {
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
}

function normalizeStock(raw: Record<string, unknown>) {
  const symbol = String(raw?.symbol ?? "");
  const div = symbol.toUpperCase().endsWith(".TA") ? 100 : 1; // agorot → ILS
  const gi = (raw?.general_info as Record<string, unknown>) ?? {};
  const scale = (v: unknown) => {
    const x = num(v);
    return x == null ? null : x / div;
  };
  const history: Bar[] = (Array.isArray(raw?.history) ? raw.history : [])
    .map((b: Record<string, unknown>) => ({
      date: String(b.date ?? b.Date ?? ""),
      open: scale(b.open ?? b.Open),
      high: scale(b.high ?? b.High),
      low: scale(b.low ?? b.Low),
      close: scale(b.close ?? b.Close),
      volume: num(b.volume ?? b.Volume),
    }))
    .filter((b: Bar) => b.date);
  const price = scale(raw?.live_price);
  const prevClose = history.length >= 2 ? history[history.length - 2].close : null;
  const change = price != null && prevClose != null ? price - prevClose : null;
  const currencyRaw = (gi.currency ?? raw?.currency) as string | undefined;
  return {
    symbol,
    name: (gi.short_name ?? gi.long_name ?? gi.name ?? null) as string | null,
    price,
    currency: currencyRaw === "ILA" ? "ILS" : (currencyRaw ?? null),
    exchange: EXCHANGE[String(gi.exchange)] ?? (gi.exchange as string) ?? null,
    sector: (gi.sector as string) ?? null,
    market_cap: num(gi.market_cap),
    previous_close: prevClose,
    change: change == null ? null : +change.toFixed(4),
    change_pct: change != null && prevClose ? +((change / prevClose) * 100).toFixed(2) : null,
    history,
  };
}

/**
 * Fetch stock objects for one or more symbols, retrying while the batch comes
 * back as ALL per-symbol error objects (transient yfinance rate-limits return
 * `{error, symbol}` with HTTP 200). Returns as soon as ≥1 symbol resolves; the
 * caller surfaces any still-errored symbols.
 */
async function fetchStocks(symbols: string, period: string, interval: string) {
  let arr: Record<string, unknown>[] = [];
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 800 * attempt));
    const data = await flaskGet("/flask/stocks", { symbols, interval, period });
    arr = (Array.isArray(data) ? data : [data]) as Record<string, unknown>[];
    if (arr.some((o) => o && o.error == null)) return arr;
  }
  return arr;
}

export const marketTools: AiToolDef[] = [
  {
    name: "market.quote",
    description:
      "Live market quote(s) for one or more symbols — Yahoo format (TASE = .TA, indices = ^GSPC / ^IXIC). Returns price, currency, exchange, sector, previous close and day change. Read-only external data; not the user's holdings (use portfolio.* for those).",
    input: z.object({
      symbols: z
        .array(z.string().min(1))
        .min(1)
        .max(20)
        .describe("Yahoo symbols, e.g. ['AAPL','MSFT','AMRK.TA','^GSPC']"),
    }),
    risk: "safe",
    execute: async (input: { symbols: string[] }) => {
      try {
        const arr = await fetchStocks(input.symbols.join(","), "5d", "1d");
        const quotes = arr.map((o) =>
          o?.error != null
            ? { symbol: o.symbol, error: String(o.error).slice(0, 100) }
            : (({ history: _h, ...q }) => q)(normalizeStock(o)),
        );
        return { quotes };
      } catch (e) {
        return { error: String(e).slice(0, 180) };
      }
    },
  },
  {
    name: "market.history",
    description:
      "Daily OHLCV price history for a symbol over a period. Pair with viz.chart (type 'line', unit 'currency', label=date value=close) to chart a symbol's trend. Read-only external data.",
    input: z.object({
      symbol: z.string().min(1),
      period: z
        .enum(["5d", "1mo", "3mo", "6mo", "1y", "ytd", "max"])
        .default("1mo"),
      interval: z.enum(["1d", "1wk", "1mo"]).default("1d"),
    }),
    risk: "safe",
    execute: async (input: {
      symbol: string;
      period: string;
      interval: string;
    }) => {
      try {
        // Batch endpoint with a single symbol (more reliable than /flask/stock);
        // it returns the same stock object incl. `history` over `period`.
        const arr = await fetchStocks(input.symbol, input.period, input.interval);
        const o = arr[0];
        if (!o || o.error != null)
          return { symbol: input.symbol, error: String(o?.error ?? "no data") };
        const s = normalizeStock(o);
        return {
          symbol: s.symbol,
          currency: s.currency,
          points: s.history.length,
          history: s.history,
        };
      } catch (e) {
        return { error: String(e).slice(0, 180) };
      }
    },
  },
  {
    name: "market.fairValue",
    description:
      "Fair-value estimate for a symbol (DCF / P/E / EV-EBITDA methods), the current price, and margin of safety % (NEGATIVE = trading above fair value). Read-only external data. Descriptive, not advice.",
    input: z.object({ symbol: z.string().min(1) }),
    risk: "safe",
    execute: async (input: { symbol: string }) => {
      try {
        const d = (await flaskGet("/flask/fair_value", {
          symbol: input.symbol,
        })) as Record<string, unknown>;
        return {
          symbol: d.symbol,
          price: num(d.price),
          primary_method: d.primary_method_used,
          margin_of_safety_pct: num(d.margin_of_safety_percent),
          valuations: d.valuations,
        };
      } catch (e) {
        return { error: String(e).slice(0, 180) };
      }
    },
  },
  {
    name: "market.healthScore",
    description:
      "Composite health score for a symbol (0–10) blending fundamentals (60%) and technicals (40%), with the driving components (analyst sentiment, margins, leverage, momentum, RSI, trend…). Read-only external data. Descriptive, not advice.",
    input: z.object({ symbol: z.string().min(1) }),
    risk: "safe",
    execute: async (input: { symbol: string }) => {
      try {
        const d = (await flaskGet("/flask/health_score", {
          symbol: input.symbol,
        })) as Record<string, unknown>;
        const bd = (d.breakdown as Record<string, unknown>) ?? {};
        const agg = (bd.aggregation as Record<string, unknown>) ?? {};
        const fund = (bd.fundamentals as Record<string, unknown>) ?? {};
        const tech = (bd.technicals as Record<string, unknown>) ?? {};
        return {
          symbol: d.symbol,
          score: num(d.score), // 0–10
          score_pct:
            agg.combined_normalized != null
              ? Math.round(Number(agg.combined_normalized) * 100)
              : null,
          fundamentals_sub_score: num(fund.sub_score),
          technicals_sub_score: num(tech.sub_score),
          fundamentals: fund.components,
          technicals: tech.components,
        };
      } catch (e) {
        return { error: String(e).slice(0, 180) };
      }
    },
  },
];
