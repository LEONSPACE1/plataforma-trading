import type { Candle, ChartRange, Dividend, Fundamentals, Quote, SearchResult } from "./types";

// Yahoo Finance's public (unofficial) endpoints. Free and keyless, but they can
// change without notice; every parser here fails soft by throwing a clear error.
const CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/";
const SEARCH_URL = "https://query2.finance.yahoo.com/v1/finance/search";
// Unlike quoteSummary, the fundamentals time series needs no crumb cookie.
const TIMESERIES_URL = "https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/";
const HEADERS = { "User-Agent": "Mozilla/5.0 (plataforma-trading)" };

const INTERVAL_FOR_RANGE: Record<ChartRange, string> = {
  "1d": "5m",
  "5d": "15m",
  "1mo": "1d",
  "6mo": "1d",
  "1y": "1d",
  "5y": "1wk",
};

type YahooChartResponse = {
  chart: {
    result:
      | {
          meta: {
            symbol: string;
            currency?: string;
            longName?: string;
            shortName?: string;
            regularMarketPrice?: number;
            regularMarketTime?: number;
            chartPreviousClose?: number;
            previousClose?: number;
            exchangeDataDelayedBy?: number;
          };
          timestamp?: number[];
          events?: { dividends?: Record<string, { amount: number; date: number }> };
          indicators: {
            quote: {
              open: (number | null)[];
              high: (number | null)[];
              low: (number | null)[];
              close: (number | null)[];
              volume: (number | null)[];
            }[];
          };
        }[]
      | null;
    error: { code: string; description: string } | null;
  };
};

async function fetchChart(symbol: string, range: string, interval: string, events = ""): Promise<YahooChartResponse> {
  const url = `${CHART_URL}${encodeURIComponent(symbol)}?range=${range}&interval=${interval}${events && `&events=${events}`}`;
  const res = await fetch(url, { headers: HEADERS, cache: "no-store" });
  if (!res.ok) throw new Error(`Yahoo ${symbol}: HTTP ${res.status}`);
  return (await res.json()) as YahooChartResponse;
}

export function parseYahooQuote(data: YahooChartResponse): Quote {
  const result = data.chart.result?.[0];
  if (!result) throw new Error(data.chart.error?.description ?? "Yahoo: sin datos");
  const m = result.meta;
  if (m.regularMarketPrice == null) throw new Error(`Yahoo ${m.symbol}: sin precio`);
  const previousClose = m.previousClose ?? m.chartPreviousClose ?? m.regularMarketPrice;
  const change = m.regularMarketPrice - previousClose;
  return {
    symbol: m.symbol,
    name: m.longName ?? m.shortName,
    price: m.regularMarketPrice,
    previousClose,
    change,
    changePercent: previousClose ? (change / previousClose) * 100 : 0,
    currency: m.currency,
    time: m.regularMarketTime ?? 0,
    delayMinutes: m.exchangeDataDelayedBy ?? 0,
    source: "yahoo",
  };
}

export function parseYahooCandles(data: YahooChartResponse): Candle[] {
  const result = data.chart.result?.[0];
  if (!result) throw new Error(data.chart.error?.description ?? "Yahoo: sin datos");
  const ts = result.timestamp ?? [];
  const q = result.indicators.quote[0];
  const candles: Candle[] = [];
  for (let i = 0; i < ts.length; i++) {
    const open = q.open[i];
    const high = q.high[i];
    const low = q.low[i];
    const close = q.close[i];
    // Yahoo pads gaps (halts, holidays) with nulls; the chart can't draw those.
    if (open == null || high == null || low == null || close == null) continue;
    candles.push({ time: ts[i], open, high, low, close, volume: q.volume[i] ?? 0 });
  }
  return candles;
}

export async function yahooQuote(symbol: string): Promise<Quote> {
  // The 1d/1d chart call carries the same meta block as the quote endpoint,
  // which Yahoo now gates behind a crumb cookie.
  return parseYahooQuote(await fetchChart(symbol, "1d", "1d"));
}

export async function yahooCandles(symbol: string, range: ChartRange): Promise<Candle[]> {
  return parseYahooCandles(await fetchChart(symbol, range, INTERVAL_FOR_RANGE[range]));
}

export function parseYahooDividends(data: YahooChartResponse): Dividend[] {
  const events = data.chart.result?.[0]?.events?.dividends ?? {};
  return Object.values(events)
    .map((d) => ({ time: d.date, amount: d.amount }))
    .sort((a, b) => a.time - b.time);
}

/** About two years of daily candles (enough for a 200-day average) plus the dividends paid in that span. */
export async function yahooDailyHistory(symbol: string): Promise<{ quote: Quote; candles: Candle[]; dividends: Dividend[] }> {
  const data = await fetchChart(symbol, "2y", "1d", "div");
  return { quote: parseYahooQuote(data), candles: parseYahooCandles(data), dividends: parseYahooDividends(data) };
}

// Trailing-twelve-month figures for margins and EPS; latest quarter (annual as
// fallback) for the balance sheet.
const FUNDAMENTAL_TYPES = {
  eps: ["trailingDilutedEPS"],
  revenue: ["trailingTotalRevenue"],
  grossProfit: ["trailingGrossProfit"],
  operatingIncome: ["trailingOperatingIncome"],
  netIncome: ["trailingNetIncome"],
  totalDebt: ["quarterlyTotalDebt", "annualTotalDebt"],
  equity: ["quarterlyStockholdersEquity", "annualStockholdersEquity"],
} as const satisfies Record<string, readonly string[]>;

type TimeseriesPoint = { asOfDate: string; currencyCode?: string; reportedValue?: { raw: number } } | null;
type YahooTimeseriesResponse = {
  timeseries: { result?: ({ meta: { type: string[] } } & Record<string, unknown>)[] | null; error?: unknown };
};

export function parseYahooFundamentals(data: YahooTimeseriesResponse): Fundamentals {
  const latest = new Map<string, NonNullable<TimeseriesPoint>>();
  for (const r of data.timeseries.result ?? []) {
    const type = r.meta.type[0];
    const points = ((r[type] as TimeseriesPoint[] | undefined) ?? []).filter(
      (p): p is NonNullable<TimeseriesPoint> => p?.reportedValue?.raw != null,
    );
    const newest = points.sort((a, b) => a.asOfDate.localeCompare(b.asOfDate)).at(-1);
    if (newest) latest.set(type, newest);
  }
  const out: Fundamentals = {};
  for (const [field, types] of Object.entries(FUNDAMENTAL_TYPES) as [keyof typeof FUNDAMENTAL_TYPES, readonly string[]][]) {
    const point = types.map((t) => latest.get(t)).find(Boolean);
    if (!point) continue;
    out[field] = point.reportedValue!.raw;
    out.currency ??= point.currencyCode;
    if (!out.asOf || point.asOfDate > out.asOf) out.asOf = point.asOfDate;
  }
  return out;
}

export async function yahooFundamentals(symbol: string): Promise<Fundamentals> {
  const types = Object.values(FUNDAMENTAL_TYPES).flat().join(",");
  const now = Math.floor(Date.now() / 1000);
  const period1 = now - 3 * 365 * 86_400;
  const url = `${TIMESERIES_URL}${encodeURIComponent(symbol)}?type=${types}&period1=${period1}&period2=${now}`;
  const res = await fetch(url, { headers: HEADERS, cache: "no-store" });
  if (!res.ok) throw new Error(`Yahoo fundamentales ${symbol}: HTTP ${res.status}`);
  return parseYahooFundamentals((await res.json()) as YahooTimeseriesResponse);
}

type YahooSearchResponse = {
  quotes?: { symbol?: string; shortname?: string; longname?: string; exchDisp?: string; quoteType?: string }[];
};

export function parseYahooSearch(data: YahooSearchResponse): SearchResult[] {
  return (data.quotes ?? [])
    .filter((q) => q.symbol)
    .map((q) => ({
      symbol: q.symbol!,
      name: q.longname ?? q.shortname ?? q.symbol!,
      exchange: q.exchDisp ?? "",
      type: q.quoteType ?? "",
    }));
}

export async function yahooSearch(query: string): Promise<SearchResult[]> {
  const url = `${SEARCH_URL}?q=${encodeURIComponent(query)}&quotesCount=10&newsCount=0`;
  const res = await fetch(url, { headers: HEADERS, cache: "no-store" });
  if (!res.ok) throw new Error(`Yahoo búsqueda: HTTP ${res.status}`);
  return parseYahooSearch((await res.json()) as YahooSearchResponse);
}
