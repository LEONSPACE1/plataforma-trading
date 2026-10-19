import { finnhubEarnings } from "./finnhub";
import { catalogName } from "./catalog";
import { hasFundamentals, isUsListing } from "./provider";
import type { Dividend, EarningsEvent } from "./types";
import { yahooDailyHistory } from "./yahoo";

// Upcoming events for an asset: the next earnings report (Finnhub, US only)
// and the next dividend, estimated from the dates of past payments because no
// free source publishes future dividend dates.

const DAY = 86_400;

export type DividendEstimate = { time: number; amount: number; /** Days between payments the estimate used. */ everyDays: number };

export type AssetEvents = {
  symbol: string;
  name?: string;
  currency?: string;
  earnings: EarningsEvent | null;
  lastDividend: Dividend | null;
  nextDividend: DividendEstimate | null;
  /** Dividends of the last 12 months over the price. */
  dividendYield: number | null;
};

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/**
 * Next ex-dividend date guessed from the usual gap between past ones (≈91 days
 * for quarterly payers, ≈182 for twice a year). Null with fewer than two
 * payments or when the company seems to have stopped paying.
 */
export function estimateNextDividend(dividends: Dividend[], now: number): DividendEstimate | null {
  if (dividends.length < 2) return null;
  const sorted = [...dividends].sort((a, b) => a.time - b.time);
  const gaps = sorted.slice(1).map((d, i) => d.time - sorted[i].time).filter((g) => g > 20 * DAY);
  if (gaps.length === 0) return null;
  const every = median(gaps);
  const last = sorted.at(-1)!;
  if (now - last.time > 1.5 * every + 30 * DAY) return null;
  let next = last.time + every;
  while (next < now - 3 * DAY) next += every;
  return { time: Math.round(next), amount: last.amount, everyDays: Math.round(every / DAY) };
}

export const isoDay = (unix: number) => new Date(unix * 1000).toISOString().slice(0, 10);

const CACHE_MS = 6 * 3600_000;
const cache = new Map<string, { at: number; value: Promise<AssetEvents> }>();

async function loadEvents(symbol: string): Promise<AssetEvents> {
  const now = Math.floor(Date.now() / 1000);
  const key = process.env.FINNHUB_API_KEY;
  const [history, earnings] = await Promise.all([
    yahooDailyHistory(symbol),
    key && isUsListing(symbol)
      ? finnhubEarnings(symbol, isoDay(now), isoDay(now + 90 * DAY), key).catch(() => [])
      : Promise.resolve([] as EarningsEvent[]),
  ]);
  const dividends = hasFundamentals(symbol) ? history.dividends : [];
  const quote = history.quote;
  const paid = dividends.filter((d) => d.time >= now - 365 * DAY).reduce((s, d) => s + d.amount, 0);
  return {
    symbol,
    name: quote.name ?? catalogName(symbol),
    currency: quote.currency,
    earnings: earnings.find((e) => e.symbol === symbol && e.date >= isoDay(now)) ?? null,
    lastDividend: dividends.at(-1) ?? null,
    nextDividend: estimateNextDividend(dividends, now),
    dividendYield: paid > 0 && quote.price > 0 ? paid / quote.price : null,
  };
}

/** Events for one symbol, cached for six hours per server instance (they change at most daily). */
export function getEvents(symbol: string): Promise<AssetEvents> {
  const hit = cache.get(symbol);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const value = loadEvents(symbol);
  cache.set(symbol, { at: Date.now(), value });
  value.catch(() => cache.delete(symbol));
  return value;
}
