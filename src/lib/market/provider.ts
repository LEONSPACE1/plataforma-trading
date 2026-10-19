import { analyze, type Analysis } from "../analysis/signal";
import { catalogName } from "./catalog";
import { finnhubQuote } from "./finnhub";
import type { Candle, ChartRange, Quote } from "./types";
import { yahooCandles, yahooDailyHistory, yahooFundamentals, yahooQuote } from "./yahoo";

/** Plain US tickers (AAPL, BRK.B, SPY) — not indices (^), FX (=X) or foreign listings (.CL). */
export function isUsListing(symbol: string): boolean {
  return /^[A-Z]{1,5}(\.[AB])?$/.test(symbol);
}

/**
 * Real-time Finnhub quote for US listings when a key is configured, Yahoo
 * otherwise. Falls back to Yahoo if Finnhub fails so one provider's outage
 * doesn't blank the screen.
 */
export async function getQuote(symbol: string, finnhubKey = process.env.FINNHUB_API_KEY): Promise<Quote> {
  let quote: Quote;
  if (finnhubKey && isUsListing(symbol)) {
    try {
      quote = await finnhubQuote(symbol, finnhubKey);
    } catch {
      quote = await yahooQuote(symbol);
    }
  } else {
    quote = await yahooQuote(symbol);
  }
  return { ...quote, name: quote.name ?? catalogName(symbol) };
}

export type QuoteResult = { symbol: string; quote?: Quote; error?: string };

export async function getQuotes(symbols: string[]): Promise<QuoteResult[]> {
  return Promise.all(
    symbols.map(async (symbol) => {
      try {
        return { symbol, quote: await getQuote(symbol) };
      } catch (e) {
        return { symbol, error: e instanceof Error ? e.message : String(e) };
      }
    }),
  );
}

export function getCandles(symbol: string, range: ChartRange): Promise<Candle[]> {
  return yahooCandles(symbol, range);
}

/** Indices (^GSPC), FX (USDCOP=X) and futures (DX-Y.NYB) have no company reports to read. */
export function hasFundamentals(symbol: string): boolean {
  return !/[\^=]|-Y\./.test(symbol);
}

/**
 * Technical + fundamental signal for one asset, on two years of daily candles.
 * Fundamentals are optional: if Yahoo has none (ETFs, some BVC preferreds) the
 * signal is technical only. `live: false` uses the last daily close instead
 * of a fresh quote.
 */
export async function getAnalysis(
  symbol: string,
  { live: useLive = true } = {},
): Promise<Analysis & { name?: string; changePercent: number }> {
  const [history, live, fundamentals] = await Promise.all([
    yahooDailyHistory(symbol),
    // The screener skips the live quote to stay within Finnhub's per-minute limit.
    useLive ? getQuote(symbol).catch(() => null) : null,
    hasFundamentals(symbol) ? yahooFundamentals(symbol).catch(() => null) : null,
  ]);
  const quote = live ?? history.quote;
  return {
    ...analyze({ quote, candles: history.candles, dividends: history.dividends, fundamentals }),
    name: quote.name ?? history.quote.name ?? catalogName(symbol),
    changePercent: quote.changePercent,
  };
}
