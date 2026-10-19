import type { Candle, Quote } from "./types";

/**
 * Candle spacing in seconds: the most common gap between recent candles, so
 * weekends, holidays and Yahoo's off-grid trailing point don't skew it.
 */
export function candleInterval(candles: Candle[]): number | null {
  const counts = new Map<number, number>();
  for (let i = Math.max(1, candles.length - 50); i < candles.length; i++) {
    const gap = candles[i].time - candles[i - 1].time;
    if (gap > 0) counts.set(gap, (counts.get(gap) ?? 0) + 1);
  }
  let best: number | null = null;
  for (const [gap, n] of counts) if (best == null || n > counts.get(best)! || (n === counts.get(best)! && gap < best)) best = gap;
  return best;
}

/**
 * Yahoo ends intraday and weekly series with an extra point stamped at the
 * last trade, inside the bucket of the candle before it. Folding it into that
 * candle keeps every candle on the interval grid.
 */
export function mergeTrailingPoint(candles: Candle[]): Candle[] {
  const interval = candleInterval(candles);
  const [prev, lastCandle] = candles.slice(-2);
  if (!interval || !prev || !lastCandle || lastCandle.time - prev.time >= interval) return candles;
  return [
    ...candles.slice(0, -2),
    {
      ...prev,
      close: lastCandle.close,
      high: Math.max(prev.high, lastCandle.high),
      low: Math.min(prev.low, lastCandle.low),
      volume: Math.max(prev.volume, lastCandle.volume),
    },
  ];
}

/**
 * Folds a live quote into the candles: it moves the last candle's close (and
 * high/low), or opens a new candle once the quote is a full interval past it.
 * Returns the same array when the quote adds nothing.
 */
export function applyLivePrice(candles: Candle[], quote: Pick<Quote, "price" | "time">, interval = candleInterval(candles)): Candle[] {
  const lastCandle = candles.at(-1);
  if (!lastCandle || !interval || !quote.time || quote.time < lastCandle.time || !(quote.price > 0)) return candles;

  const steps = Math.floor((quote.time - lastCandle.time) / interval);
  if (steps >= 1) {
    const p = quote.price;
    return [...candles, { time: lastCandle.time + steps * interval, open: p, high: p, low: p, close: p, volume: 0 }];
  }
  if (lastCandle.close === quote.price) return candles;
  const updated = {
    ...lastCandle,
    close: quote.price,
    high: Math.max(lastCandle.high, quote.price),
    low: Math.min(lastCandle.low, quote.price),
  };
  return [...candles.slice(0, -1), updated];
}
