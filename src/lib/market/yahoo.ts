import type { Candle, ChartRange, Quote, SearchResult } from "./types";

// Yahoo Finance's public (unofficial) endpoints. Free and keyless, but they can
// change without notice; every parser here fails soft by throwing a clear error.
const CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/";
const SEARCH_URL = "https://query2.finance.yahoo.com/v1/finance/search";
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

async function fetchChart(symbol: string, range: string, interval: string): Promise<YahooChartResponse> {
  const url = `${CHART_URL}${encodeURIComponent(symbol)}?range=${range}&interval=${interval}`;
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
