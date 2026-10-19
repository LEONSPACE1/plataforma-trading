import { describe, expect, it } from "vitest";
import type { Candle, Quote } from "../market/types";
import { parseYahooDividends, parseYahooFundamentals } from "../market/yahoo";
import { bollinger, ema, last, macd, rsi, sma } from "./indicators";
import { analyze, fundamentalFactors } from "./signal";

const DAY = 86_400;

function candles(closes: number[], volume = 1000): Candle[] {
  return closes.map((c, i) => ({ time: i * DAY, open: c, high: c, low: c, close: c, volume }));
}

function quote(price: number, extra: Partial<Quote> = {}): Quote {
  return {
    symbol: "TEST",
    price,
    change: 0,
    changePercent: 0,
    previousClose: price,
    currency: "USD",
    time: 400 * DAY,
    delayMinutes: 0,
    source: "yahoo",
    ...extra,
  };
}

describe("indicators", () => {
  it("computes simple and exponential averages", () => {
    expect(sma([1, 2, 3, 4, 5], 3)).toEqual([null, null, 2, 3, 4]);
    const e = ema([1, 2, 3, 4, 5], 3);
    expect(e.slice(0, 3)).toEqual([null, null, 2]);
    expect(e[3]).toBeCloseTo(3);
    expect(e[4]).toBeCloseTo(4);
  });

  it("matches the textbook RSI example (Wilder, 14 periods)", () => {
    // Closing prices from StockCharts' RSI walkthrough; first RSI is 70.53.
    const closes = [
      44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.0,
    ];
    const r = rsi(closes, 14);
    expect(r[13]).toBeNull();
    expect(r[14]).toBeCloseTo(70.46, 1);
    expect(r[15]).toBeCloseTo(66.25, 1);
  });

  it("pins RSI to the extremes on one-way moves", () => {
    expect(last(rsi([...Array(20).keys()], 14))).toBe(100);
    expect(last(rsi([...Array(20).keys()].reverse(), 14))).toBe(0);
  });

  it("gives a positive MACD histogram on an accelerating rise", () => {
    const closes = Array.from({ length: 60 }, (_, i) => 100 + i * i * 0.05);
    const m = macd(closes);
    expect(m.macd.findIndex((v) => v != null)).toBe(25);
    expect(m.signal.findIndex((v) => v != null)).toBe(33);
    expect(last(m.histogram)).toBeGreaterThan(0);
  });

  it("collapses Bollinger bands on a flat series", () => {
    const b = bollinger(Array(25).fill(10), 20, 2);
    expect([last(b.lower), last(b.middle), last(b.upper)]).toEqual([10, 10, 10]);
  });
});

describe("signal", () => {
  it("reads a steady uptrend as a buy and a downtrend as a sell", () => {
    // Rising with pullbacks, ending on an upswing that isn't overbought yet.
    const up = Array.from({ length: 275 }, (_, i) => 100 + i * 0.3 + 6 * Math.sin(i / 6));
    const buy = analyze({ quote: quote(up.at(-1)!), candles: candles(up) });
    expect(buy.verdict).toBe("comprar");
    expect(buy.fundamentalScore).toBeNull();
    expect(buy.factors.find((f) => f.name.includes("200"))?.vote).toBe(1);

    const down = up.map((v) => 300 - v);
    expect(analyze({ quote: quote(down.at(-1)!), candles: candles(down) }).verdict).toBe("vender");
  });

  it("skips the 200-day rules with a short history and refuses too little data", () => {
    const short = Array.from({ length: 60 }, (_, i) => 100 + i);
    const a = analyze({ quote: quote(160), candles: candles(short) });
    expect(a.factors.some((f) => f.name.includes("200"))).toBe(false);
    expect(a.notes.join(" ")).toContain("200");
    expect(() => analyze({ quote: quote(1), candles: candles([1, 2, 3]) })).toThrow();
  });

  it("ignores volume when the asset has none (FX)", () => {
    const closes = Array.from({ length: 80 }, (_, i) => 100 + Math.sin(i));
    const a = analyze({ quote: quote(100), candles: candles(closes, 0) });
    expect(a.technical.volumeRatio).toBeNull();
    expect(a.factors.some((f) => f.name === "Volumen")).toBe(false);
  });

  it("scores fundamentals and blends them into the verdict", () => {
    const f = { currency: "USD", eps: 10, revenue: 1000, netIncome: 200, totalDebt: 100, equity: 500 };
    const dividends = [{ time: 390 * DAY, amount: 5 }, { time: 10 * DAY, amount: 99 }];
    const { factors, snapshot } = fundamentalFactors(quote(100), dividends, f);
    expect(snapshot).toMatchObject({ pe: 10, netMargin: 0.2, debtToEquity: 0.2, dividendYield: 0.05 });
    expect(factors.map((x) => x.vote)).toEqual([1, 1, 1, 1]);
  });

  it("skips P/E when reports and price use different currencies", () => {
    const { factors, notes, snapshot } = fundamentalFactors(quote(17, { currency: "USD" }), [], {
      currency: "COP",
      eps: 7000,
      revenue: 100,
      netIncome: 10,
    });
    expect(snapshot?.pe).toBeNull();
    expect(factors.some((x) => x.name.startsWith("P/E"))).toBe(false);
    expect(notes[0]).toContain("COP");
  });

  it("flags losses and negative equity", () => {
    const { factors } = fundamentalFactors(quote(10), [], { eps: -1, revenue: 100, netIncome: -5, totalDebt: 50, equity: -1 });
    expect(factors.map((x) => x.vote)).toEqual([-1, -1, -1]);
  });
});

describe("Yahoo fundamentals parsers", () => {
  it("keeps the newest value per field and prefers quarterly over annual", () => {
    const point = (asOfDate: string, raw: number) => ({ asOfDate, currencyCode: "COP", reportedValue: { raw } });
    const data = {
      timeseries: {
        result: [
          { meta: { type: ["trailingDilutedEPS"] }, trailingDilutedEPS: [point("2025-12-31", 300), null, point("2026-06-30", 352.7)] },
          { meta: { type: ["annualTotalDebt"] }, annualTotalDebt: [point("2025-12-31", 9)] },
          { meta: { type: ["quarterlyTotalDebt"] }, quarterlyTotalDebt: [point("2026-06-30", 8)] },
          { meta: { type: ["annualStockholdersEquity"] }, annualStockholdersEquity: [point("2025-12-31", 4)] },
          { meta: { type: ["trailingTotalRevenue"] } },
        ],
      },
    };
    expect(parseYahooFundamentals(data)).toEqual({ eps: 352.7, totalDebt: 8, equity: 4, currency: "COP", asOf: "2026-06-30" });
  });

  it("reads dividend events in date order", () => {
    const chart = {
      chart: {
        result: [
          {
            meta: { symbol: "X" },
            events: { dividends: { "20": { amount: 2, date: 20 }, "10": { amount: 1, date: 10 } } },
            indicators: { quote: [] },
          },
        ],
        error: null,
      },
    };
    expect(parseYahooDividends(chart)).toEqual([{ time: 10, amount: 1 }, { time: 20, amount: 2 }]);
  });
});
