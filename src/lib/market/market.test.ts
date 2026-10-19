import { describe, expect, it } from "vitest";
import { parseFinnhubQuote } from "./finnhub";
import { isUsListing } from "./provider";
import { isValidSymbol, parseSymbolList } from "./symbols";
import { parseYahooCandles, parseYahooQuote, parseYahooSearch } from "./yahoo";

// Shape of Yahoo's v8 chart response, trimmed to the fields we read.
const chart = {
  chart: {
    result: [
      {
        meta: {
          symbol: "ECOPETROL.CL",
          currency: "COP",
          longName: "Ecopetrol S.A.",
          regularMarketPrice: 2000,
          regularMarketTime: 1_700_000_000,
          chartPreviousClose: 1900,
          exchangeDataDelayedBy: 20,
        },
        timestamp: [1, 2, 3],
        indicators: {
          quote: [
            {
              open: [10, null, 12],
              high: [11, null, 13],
              low: [9, null, 11],
              close: [10.5, null, 12.5],
              volume: [100, null, null],
            },
          ],
        },
      },
    ],
    error: null,
  },
};

describe("Yahoo parsers", () => {
  it("builds a quote with change and delay", () => {
    const q = parseYahooQuote(chart);
    expect(q).toMatchObject({ symbol: "ECOPETROL.CL", price: 2000, change: 100, currency: "COP", delayMinutes: 20 });
    expect(q.changePercent).toBeCloseTo(5.263, 2);
  });

  it("drops null candles and defaults missing volume", () => {
    const candles = parseYahooCandles(chart);
    expect(candles.map((c) => c.time)).toEqual([1, 3]);
    expect(candles[1].volume).toBe(0);
  });

  it("surfaces Yahoo's error description", () => {
    const bad = { chart: { result: null, error: { code: "Not Found", description: "No data found" } } };
    expect(() => parseYahooQuote(bad)).toThrow("No data found");
  });

  it("maps search results", () => {
    expect(parseYahooSearch({ quotes: [{ symbol: "EC", shortname: "Ecopetrol", exchDisp: "NYSE", quoteType: "EQUITY" }, {}] }))
      .toEqual([{ symbol: "EC", name: "Ecopetrol", exchange: "NYSE", type: "EQUITY" }]);
  });
});

describe("Finnhub parser", () => {
  it("builds a real-time quote", () => {
    expect(parseFinnhubQuote("AAPL", { c: 110, d: 10, dp: 10, pc: 100, t: 5 })).toMatchObject({
      price: 110,
      change: 10,
      changePercent: 10,
      delayMinutes: 0,
      source: "finnhub",
    });
  });

  it("rejects the all-zero answer Finnhub gives unknown symbols", () => {
    expect(() => parseFinnhubQuote("NOPE", { c: 0, d: null, dp: null, pc: 0, t: 0 })).toThrow();
  });
});

describe("symbols", () => {
  it("routes only plain US tickers to Finnhub", () => {
    expect(["AAPL", "SPY", "BRK.B"].every(isUsListing)).toBe(true);
    expect(["^GSPC", "USDCOP=X", "ECOPETROL.CL", "DX-Y.NYB"].some(isUsListing)).toBe(false);
  });

  it("validates and dedupes symbol lists", () => {
    expect(parseSymbolList("aapl, AAPL ,usdcop=x")).toEqual(["AAPL", "USDCOP=X"]);
    expect(parseSymbolList("AAPL,../etc")).toBeNull();
    expect(parseSymbolList("")).toBeNull();
    expect(isValidSymbol("^COLCAP")).toBe(true);
  });
});
