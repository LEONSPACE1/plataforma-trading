import { describe, expect, it } from "vitest";
import { checkIndicatorAlert, type Alert } from "./alerts/rules";
import { bogotaDate, buildSummary, nextSession, summaryDue } from "./alerts/summary";
import { backtestSignal } from "./analysis/backtest";
import type { Analysis, TechnicalSnapshot } from "./analysis/signal";
import { estimateNextDividend, type AssetEvents } from "./market/events";
import { parseFinnhubEarnings } from "./market/finnhub";
import { parseTrm } from "./market/trm";
import type { Candle, Quote } from "./market/types";
import { companySearchName, parseGoogleNewsRss } from "./market/news";
import { parseYahooNews } from "./market/yahoo";
import { allocation, closeOn, compareWithBenchmark, dividendsReceived, positionExtras, summarizePortfolio, type Position } from "./portfolio";
import { filterScreener, NO_FILTERS, screenerMarket, screenerRow, type ScreenerRow } from "./screener";

const DAY = 86_400;
const T0 = Date.parse("2024-01-01T00:00:00Z") / 1000;

function quote(symbol: string, price: number, extra: Partial<Quote> = {}): Quote {
  return { symbol, price, change: 0, changePercent: 0, previousClose: price, currency: "USD", time: 0, delayMinutes: 0, source: "yahoo", ...extra };
}

const candles = (closes: number[]): Candle[] =>
  closes.map((c, i) => ({ time: T0 + i * DAY, open: c, high: c, low: c, close: c, volume: 1000 }));

describe("indicator alerts", () => {
  const alert = (extra: Partial<Alert>): Alert => ({
    id: "a1",
    user_id: "u1",
    symbol: "AAPL",
    kind: "rsi_below",
    target: 30,
    active: true,
    last_verdict: null,
    last_state: null,
    last_checked_at: null,
    last_triggered_at: null,
    created_at: "2026-10-19T00:00:00Z",
    ...extra,
  });
  const tech = (t: Partial<TechnicalSnapshot>) => ({ technical: { rsi14: null, sma50: null, sma200: null, macd: null, macdSignal: null, ...t } }) as Analysis;

  it("sets a baseline first, then fires only when RSI crosses in the alert's direction", () => {
    expect(checkIndicatorAlert(alert({}), tech({ rsi14: 25 }))).toEqual({ state: "abajo", notification: null });
    expect(checkIndicatorAlert(alert({ last_state: "abajo" }), tech({ rsi14: 35 })).notification).toBeNull();
    const r = checkIndicatorAlert(alert({ last_state: "arriba" }), tech({ rsi14: 28 }));
    expect(r.state).toBe("abajo");
    expect(r.notification?.title).toBe("AAPL: RSI en 28, por debajo de 30");
    expect(r.notification?.body).toContain("sobreventa");
  });

  it("fires on both directions of the 50/200 and MACD crosses", () => {
    const golden = checkIndicatorAlert(alert({ kind: "ma_cross", target: null, last_state: "abajo" }), tech({ sma50: 105, sma200: 100 }));
    expect(golden.notification?.title).toContain("cruce dorado");
    const death = checkIndicatorAlert(alert({ kind: "ma_cross", target: null, last_state: "arriba" }), tech({ sma50: 95, sma200: 100 }));
    expect(death.notification?.title).toContain("cruce de la muerte");
    const macd = checkIndicatorAlert(alert({ kind: "macd_cross", target: null, last_state: "arriba" }), tech({ macd: -1, macdSignal: 0 }));
    expect(macd.notification?.title).toBe("AAPL: el MACD cruzó su señal hacia abajo");
  });

  it("does nothing without enough history", () => {
    expect(checkIndicatorAlert(alert({ kind: "ma_cross", target: null, last_state: "abajo" }), tech({ sma50: 105 }))).toEqual({ state: null, notification: null });
  });
});

describe("backtest", () => {
  it("buys after the signal turns positive and beats holding through a crash", () => {
    // 260 flat-ish sessions, a long rise, then a long fall.
    const closes = [
      ...Array.from({ length: 260 }, (_, i) => 100 + Math.sin(i / 5)),
      ...Array.from({ length: 150 }, (_, i) => 100 + i),
      ...Array.from({ length: 150 }, (_, i) => 250 - i * 1.2),
    ];
    const b = backtestSignal(candles(closes));
    expect(b.trades.length).toBeGreaterThan(0);
    expect(b.equity[0].buyHold).toBeCloseTo(100, 0);
    expect(b.strategyReturn).toBeGreaterThan(b.buyHoldReturn);
    expect(b.strategyMaxDrawdown).toBeGreaterThan(b.buyHoldMaxDrawdown);
    for (const t of b.trades) expect(t.entryTime).toBeGreaterThanOrEqual(b.from);
  });

  it("needs more than 200 sessions", () => {
    expect(() => backtestSignal(candles(Array(150).fill(100)))).toThrow(/200 sesiones/);
  });
});

describe("dividend estimate", () => {
  const now = T0 + 400 * DAY;
  it("projects the usual gap between payments", () => {
    const quarterly = [0, 91, 182, 273, 364].map((d) => ({ time: T0 + d * DAY, amount: 0.25 }));
    const next = estimateNextDividend(quarterly, now)!;
    expect(next.everyDays).toBe(91);
    expect(next.time).toBe(T0 + 455 * DAY);
    expect(next.amount).toBe(0.25);
  });

  it("gives up with one payment or when payments stopped", () => {
    expect(estimateNextDividend([{ time: T0, amount: 1 }], now)).toBeNull();
    expect(estimateNextDividend([{ time: T0 - 400 * DAY, amount: 1 }, { time: T0 - 309 * DAY, amount: 1 }], now)).toBeNull();
  });
});

describe("parsers", () => {
  it("reads Yahoo news, newest first, skipping items without a link", () => {
    const news = parseYahooNews({
      news: [
        { uuid: "a", title: "Old", publisher: "X", link: "https://a", providerPublishTime: 1, relatedTickers: ["EC", "EC"] },
        { uuid: "b", title: "New", publisher: "Y", link: "https://b", providerPublishTime: 2 },
        { uuid: "c", title: "Broken" },
      ],
    });
    expect(news.map((n) => n.title)).toEqual(["New", "Old"]);
    expect(news[1].related).toEqual(["EC"]);
  });

  it("reads Finnhub earnings and the TRM", () => {
    const e = parseFinnhubEarnings({ earningsCalendar: [{ symbol: "AAPL", date: "2026-10-30", hour: "amc", epsEstimate: 1.6 }] });
    expect(e).toEqual([{ symbol: "AAPL", date: "2026-10-30", hour: "amc", epsEstimate: 1.6, revenueEstimate: null }]);
    expect(parseTrm([{ valor: "3174.67", vigenciadesde: "2026-10-17T00:00:00.000" }])).toEqual({ value: 3174.67, validFrom: "2026-10-17" });
    expect(() => parseTrm([])).toThrow();
  });
});

describe("screener", () => {
  const analysis = {
    symbol: "AAPL",
    name: "Apple",
    price: 110,
    currency: "USD",
    verdict: "comprar",
    score: 40,
    technicalScore: 50,
    fundamentalScore: 25,
    technical: { rsi14: 55.56, sma50: 105, sma200: 100 },
    fundamentals: { pe: 28.04, dividendYield: 0.005, netMargin: 0.25, debtToEquity: 1.5 },
  } as unknown as Analysis & { name: string };

  it("classifies markets", () => {
    expect(["AAPL", "ECOPETROL.CL", "^GSPC", "USDCOP=X", "DX-Y.NYB"].map(screenerMarket)).toEqual(["us", "co", "index", "fx", "fx"]);
  });

  it("records when the verdict changes", () => {
    const now = new Date("2026-10-19T12:00:00Z");
    const first = screenerRow(analysis, 1.234, null, now);
    expect(first).toMatchObject({ verdict: "comprar", previous_verdict: null, verdict_changed_at: null, rsi: 55.6, pe: 28, above_sma200: true, golden_cross: true, change_percent: 1.23 });
    const changed = screenerRow(analysis, 0, { verdict: "mantener", previous_verdict: null, verdict_changed_at: null }, now);
    expect(changed).toMatchObject({ previous_verdict: "mantener", verdict_changed_at: now.toISOString() });
    const same = screenerRow(analysis, 0, { verdict: "comprar", previous_verdict: "vender", verdict_changed_at: "2026-10-01T00:00:00Z" }, now);
    expect(same).toMatchObject({ previous_verdict: "vender", verdict_changed_at: "2026-10-01T00:00:00Z" });
  });

  it("filters on every set criterion", () => {
    const row = (symbol: string, extra: Partial<ScreenerRow>) => ({ symbol, market: screenerMarket(symbol), verdict: "mantener", rsi: 50, pe: 20, dividend_yield: 0.01, above_sma200: true, golden_cross: false, ...extra }) as ScreenerRow;
    const rows = [row("AAPL", { verdict: "comprar" }), row("ECOPETROL.CL", { rsi: 25, pe: 5, dividend_yield: 0.12 }), row("MSFT", { pe: null }), row("X", { verdict: null })];
    expect(filterScreener(rows, NO_FILTERS).map((r) => r.symbol)).toEqual(["AAPL", "ECOPETROL.CL", "MSFT"]);
    expect(filterScreener(rows, { ...NO_FILTERS, market: "co" }).map((r) => r.symbol)).toEqual(["ECOPETROL.CL"]);
    expect(filterScreener(rows, { ...NO_FILTERS, rsiMax: 30 }).map((r) => r.symbol)).toEqual(["ECOPETROL.CL"]);
    expect(filterScreener(rows, { ...NO_FILTERS, peMax: 25, dividendMin: 3 }).map((r) => r.symbol)).toEqual(["ECOPETROL.CL"]);
    expect(filterScreener(rows, { ...NO_FILTERS, verdict: "comprar" }).map((r) => r.symbol)).toEqual(["AAPL"]);
  });
});

describe("daily summary", () => {
  it("runs on weekdays from 16:15 Bogotá time", () => {
    expect(summaryDue(new Date("2026-10-19T21:14:00Z"))).toBe(false); // Monday 16:14
    expect(summaryDue(new Date("2026-10-19T21:15:00Z"))).toBe(true);
    expect(summaryDue(new Date("2026-10-20T04:59:00Z"))).toBe(true); // still Monday 23:59 in Bogotá
    expect(summaryDue(new Date("2026-10-24T22:00:00Z"))).toBe(false); // Saturday
    expect(bogotaDate(new Date("2026-10-20T03:00:00Z")).day).toBe("2026-10-19");
    expect(nextSession("2026-10-23")).toBe("2026-10-26");
  });

  it("lists movers, the day's P&L, signal changes and tomorrow's events", () => {
    const pos: Position = { id: "p", symbol: "AAPL", quantity: 10, buy_price: 100, bought_on: "2026-01-02", note: null };
    const quotes = { AAPL: quote("AAPL", 120, { change: 2, changePercent: 1.7 }), MSFT: quote("MSFT", 400, { changePercent: -3.2 }) };
    const events = [
      { symbol: "AAPL", earnings: { symbol: "AAPL", date: "2026-10-20", hour: "amc", epsEstimate: null, revenueEstimate: null }, nextDividend: null },
      { symbol: "MSFT", earnings: { symbol: "MSFT", date: "2026-10-28", hour: null, epsEstimate: null, revenueEstimate: null }, nextDividend: null },
    ] as unknown as AssetEvents[];
    const n = buildSummary({
      day: "2026-10-19",
      quotes,
      portfolio: summarizePortfolio([pos], quotes),
      signalChanges: [{ symbol: "MSFT", from: "mantener", to: "vender" }],
      events,
    })!;
    expect(n.title).toContain("Resumen del día");
    const lines = n.body.split("\n");
    expect(lines[1]).toContain("MSFT -3,2 %");
    expect(n.body).toContain("Tu portafolio hoy: +20 USD.");
    expect(n.body).toContain("MSFT: de Mantener a Vender");
    expect(n.body).toContain("AAPL presenta resultados");
    expect(n.body).not.toContain("MSFT presenta");
  });

  it("sends nothing when there is nothing to say", () => {
    expect(buildSummary({ day: "2026-10-19", quotes: {}, portfolio: null, signalChanges: [], events: [] })).toBeNull();
  });
});

describe("consolidated portfolio", () => {
  const pos: Position = { id: "p1", symbol: "ECOPETROL.CL", quantity: 100, buy_price: 2000, bought_on: "2024-01-10", note: null };

  it("counts dividends with an ex-date after the purchase day", () => {
    const divs = [
      { time: Date.parse("2024-01-10T14:00:00Z") / 1000, amount: 50 }, // same day: bought too late
      { time: Date.parse("2024-04-01T14:00:00Z") / 1000, amount: 300 },
    ];
    expect(dividendsReceived(pos, divs)).toBe(30_000);
  });

  it("measures the benchmark from the first session on or after the purchase", () => {
    const bench = candles(Array.from({ length: 30 }, (_, i) => 100 + i)); // starts 2024-01-01
    expect(closeOn(bench, "2024-01-10")).toBe(109);
    expect(closeOn(bench, "2023-01-01")).toBeNull();
    const x = positionExtras(pos, "COP", { dividends: [] }, { candles: bench });
    expect(x.benchmark).toBe("ICOLCAP.CL");
    expect(x.benchmarkReturn).toBeCloseTo(129 / 109 - 1);
  });

  it("compares returns with dividends and splits the value by market", () => {
    const s = summarizePortfolio(
      [pos, { ...pos, id: "p2", symbol: "AAPL", quantity: 1, buy_price: 100 }],
      { "ECOPETROL.CL": quote("ECOPETROL.CL", 2200, { currency: "COP" }), AAPL: quote("AAPL", 100) },
      4000,
    );
    const c = compareWithBenchmark(s.rows, {
      p1: { dividends: 20_000, benchmark: "ICOLCAP.CL", benchmarkReturn: 0.05 },
      p2: { dividends: 0, benchmark: "SPY", benchmarkReturn: 0.2 },
    });
    const cop = c.find((x) => x.currency === "COP")!;
    expect(cop.dividends).toBe(20_000);
    expect(cop.ownReturn).toBeCloseTo(0.2); // (220,000 + 20,000) / 200,000 − 1
    expect(cop.benchmarkReturn).toBeCloseTo(0.05);
    expect(c.find((x) => x.currency === "USD")?.benchmarkReturn).toBeCloseTo(0.2);
    const mix = allocation(s.rows, 4000);
    expect(mix.byMarket.map((m) => [m.key, Math.round(m.share * 100)])).toEqual([["us", 65], ["co", 35]]);
  });
});

describe("Colombian news", () => {
  it("cleans company names for the search", () => {
    expect(companySearchName("Grupo Energía Bogotá S.A. E.S.P.")).toBe("Grupo Energía Bogotá");
    expect(companySearchName("Ecopetrol S.A.")).toBe("Ecopetrol");
    expect(companySearchName("Grupo Nutresa S. A.")).toBe("Grupo Nutresa");
    expect(companySearchName("Grupo Aval Acciones y Valores S.A.")).toBe("Grupo Aval Acciones y Valores");
  });

  it("reads the Google News RSS feed", () => {
    const xml = `<?xml version="1.0"?><rss><channel><title>x</title>
      <item><title>Ecopetrol anuncia dividendos &amp; más - Portafolio</title><link>https://news.google.com/rss/articles/abc</link><guid isPermaLink="false">abc</guid><pubDate>Sun, 18 Oct 2026 14:00:00 GMT</pubDate><source url="https://www.portafolio.co">Portafolio</source></item>
      <item><title>Otra - La República</title><link>https://news.google.com/rss/articles/def</link><guid>def</guid><pubDate>Mon, 19 Oct 2026 10:00:00 GMT</pubDate><source url="https://www.larepublica.co">La República</source></item>
    </channel></rss>`;
    const news = parseGoogleNewsRss(xml);
    expect(news.map((n) => n.title)).toEqual(["Otra", "Ecopetrol anuncia dividendos & más"]);
    expect(news[1]).toMatchObject({ id: "abc", publisher: "Portafolio", url: "https://news.google.com/rss/articles/abc", time: Date.parse("2026-10-18T14:00:00Z") / 1000 });
  });
});
