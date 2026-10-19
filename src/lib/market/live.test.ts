import { describe, expect, it } from "vitest";
import { applyLivePrice, candleInterval, mergeTrailingPoint } from "./live";
import type { Candle } from "./types";

const DAY = 86_400;
const c = (time: number, close: number): Candle => ({ time, open: close, high: close + 1, low: close - 1, close, volume: 10 });

describe("live candles", () => {
  // Thu, Fri, then Mon: the weekend gap must not be read as the interval.
  const daily = [c(0, 100), c(DAY, 101), c(4 * DAY, 102)];

  it("infers the interval from the smallest gap", () => {
    expect(candleInterval(daily)).toBe(DAY);
    expect(candleInterval([c(0, 1)])).toBeNull();
  });

  it("moves the last candle's close, high and low", () => {
    const up = applyLivePrice(daily, { price: 110, time: 4 * DAY + 600 });
    expect(up).toHaveLength(3);
    expect(up[2]).toMatchObject({ open: 102, close: 110, high: 110, low: 101, volume: 10 });
    expect(applyLivePrice(daily, { price: 90, time: 4 * DAY + 600 })[2]).toMatchObject({ close: 90, high: 103, low: 90 });
    expect(daily[2].close).toBe(102);
  });

  it("opens a new candle when the interval rolls over", () => {
    const next = applyLivePrice(daily, { price: 105, time: 7 * DAY + 3600 });
    expect(next).toHaveLength(4);
    expect(next[3]).toEqual({ time: 7 * DAY, open: 105, high: 105, low: 105, close: 105, volume: 0 });
  });

  it("folds Yahoo's off-grid trailing point into the candle before it", () => {
    const m = 900;
    const intraday = [c(0, 10), c(m, 11), c(2 * m, 12), { ...c(2 * m + 105, 13), volume: 0 }];
    expect(candleInterval(intraday)).toBe(m);
    expect(mergeTrailingPoint(intraday)).toEqual([c(0, 10), c(m, 11), { ...c(2 * m, 13), open: 12, low: 11, volume: 10 }]);
    expect(mergeTrailingPoint(daily)).toBe(daily);
  });

  it("ignores stale, empty or unchanged quotes", () => {
    expect(applyLivePrice(daily, { price: 120, time: DAY })).toBe(daily);
    expect(applyLivePrice(daily, { price: 0, time: 5 * DAY })).toBe(daily);
    expect(applyLivePrice(daily, { price: 102, time: 4 * DAY + 5 })).toBe(daily);
    expect(applyLivePrice([], { price: 1, time: 1 })).toEqual([]);
  });
});
