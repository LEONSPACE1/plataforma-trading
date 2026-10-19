import { describe, expect, it } from "vitest";
import { verdictFor, type Analysis } from "../analysis/signal";
import type { Quote } from "../market/types";
import { summarizePortfolio, type Position } from "../portfolio";
import { checkPriceAlert, checkSignalAlert, signalCheckDue, type Alert } from "./rules";
import { parseStartCode } from "./start-code";

function quote(symbol: string, price: number, extra: Partial<Quote> = {}): Quote {
  return {
    symbol,
    price,
    change: 1,
    changePercent: 1,
    previousClose: price - 1,
    currency: "USD",
    time: 0,
    delayMinutes: 0,
    source: "yahoo",
    ...extra,
  };
}

function alert(extra: Partial<Alert>): Alert {
  return {
    id: "a1",
    user_id: "u1",
    symbol: "AAPL",
    kind: "price_above",
    target: 200,
    active: true,
    last_verdict: null,
    last_checked_at: null,
    last_triggered_at: null,
    created_at: "2026-10-19T00:00:00Z",
    ...extra,
  };
}

const analysis = (score: number, technicalScore: number) =>
  ({ symbol: "AAPL", score, technicalScore, verdict: verdictFor(score), summary: "Resumen." }) as Analysis;

describe("price alerts", () => {
  it("fires when the price crosses the target in the alert's direction", () => {
    expect(checkPriceAlert(alert({ kind: "price_above", target: 200 }), quote("AAPL", 199.99))).toBeNull();
    expect(checkPriceAlert(alert({ kind: "price_above", target: 200 }), quote("AAPL", 200))?.title).toBe("AAPL subió a 200 USD");
    expect(checkPriceAlert(alert({ kind: "price_below", target: 200 }), quote("AAPL", 201))).toBeNull();
    expect(checkPriceAlert(alert({ kind: "price_below", target: 200 }), quote("AAPL", 150))?.url).toBe("/activo/AAPL");
  });
});

describe("signal alerts", () => {
  it("only sets a baseline on the first check", () => {
    const r = checkSignalAlert(alert({ kind: "signal_change", target: null }), analysis(45, 10));
    expect(r).toEqual({ verdict: "comprar", notification: null });
  });

  it("notifies when the combined verdict changes", () => {
    const r = checkSignalAlert(alert({ kind: "signal_change", target: null, last_verdict: "mantener" }), analysis(45, 10));
    expect(r.verdict).toBe("comprar");
    expect(r.notification?.title).toBe("AAPL: la señal pasó de Mantener a Comprar");
    expect(r.notification?.body).toContain("Puntaje +45");
  });

  it("uses the technical score for technical alerts", () => {
    const a = alert({ kind: "technical_change", target: null, last_verdict: "mantener" });
    expect(checkSignalAlert(a, analysis(45, 10)).notification).toBeNull();
    expect(checkSignalAlert(a, analysis(0, -30)).notification?.title).toBe("AAPL: la señal técnica pasó de Mantener a Vender");
  });

  it("re-checks signals at most once an hour", () => {
    const now = new Date("2026-10-19T15:00:00Z");
    expect(signalCheckDue(alert({ last_checked_at: null }), now)).toBe(true);
    expect(signalCheckDue(alert({ last_checked_at: "2026-10-19T14:30:00Z" }), now)).toBe(false);
    expect(signalCheckDue(alert({ last_checked_at: "2026-10-19T14:00:00Z" }), now)).toBe(true);
  });

  it("maps scores to verdicts at ±30", () => {
    expect([verdictFor(30), verdictFor(29), verdictFor(-29), verdictFor(-30)]).toEqual(["comprar", "mantener", "mantener", "vender"]);
  });
});

describe("telegram linking", () => {
  it("reads the code from the deep-link /start message", () => {
    expect(parseStartCode("/start abcDEF123_-xyz")).toBe("abcDEF123_-xyz");
    expect(parseStartCode("/start@MiBot abcDEF123456")).toBe("abcDEF123456");
    expect(parseStartCode("/start")).toBeNull();
    expect(parseStartCode("hola")).toBeNull();
  });
});

describe("portfolio", () => {
  const pos = (symbol: string, quantity: number, buy_price: number): Position => ({
    id: symbol,
    symbol,
    quantity,
    buy_price,
    bought_on: "2026-01-02",
    note: null,
  });

  it("computes P&L per position, per currency and consolidated in COP", () => {
    const s = summarizePortfolio(
      [pos("AAPL", 10, 100), pos("ECOPETROL.CL", 1000, 2000)],
      { AAPL: quote("AAPL", 120), "ECOPETROL.CL": quote("ECOPETROL.CL", 1800, { currency: "COP", change: -10 }) },
      4000,
    );
    expect(s.rows[0]).toMatchObject({ cost: 1000, value: 1200, pnl: 200, pnlPercent: 20, dayChange: 10 });
    expect(s.rows[1]).toMatchObject({ cost: 2_000_000, value: 1_800_000, pnl: -200_000, pnlPercent: -10, dayChange: -10_000 });
    expect(s.totals.map((t) => t.currency)).toEqual(["USD", "COP"]);
    // 1000 USD × 4000 + 2,000,000 COP invested; 1200 × 4000 + 1,800,000 now.
    expect(s.totalCop).toMatchObject({ cost: 6_000_000, value: 6_600_000, pnl: 600_000, pnlPercent: 10 });
  });

  it("leaves positions without a quote out of the totals", () => {
    const s = summarizePortfolio([pos("AAPL", 1, 100), pos("MSFT", 1, 300)], { AAPL: quote("AAPL", 110) });
    expect(s.unpriced).toBe(1);
    expect(s.totals).toHaveLength(1);
    expect(s.totals[0].cost).toBe(100);
    expect(s.totalCop).toBeNull(); // no USD/COP rate
  });
});
