import type { Candle, Dividend, Quote } from "./market/types";

// Profit and loss of the user's positions. Buy prices are in the asset's own
// trading currency (USD for AAPL, COP for ECOPETROL.CL), so totals are kept per
// currency and, when the USD/COP rate is known, also consolidated in COP.

export type Position = {
  id: string;
  symbol: string;
  quantity: number;
  buy_price: number;
  bought_on: string;
  note: string | null;
};

export type PositionRow = Position & {
  currency?: string;
  price?: number;
  cost: number;
  value?: number;
  pnl?: number;
  pnlPercent?: number;
  /** Today's change on the whole position. */
  dayChange?: number;
};

export type CurrencyTotal = {
  currency: string;
  cost: number;
  value: number;
  pnl: number;
  pnlPercent: number;
  dayChange: number;
};

export type PortfolioSummary = {
  rows: PositionRow[];
  /** One entry per currency, only over positions that have a price. */
  totals: CurrencyTotal[];
  /** Everything converted to COP with the USD/COP rate; null if a currency can't be converted. */
  totalCop: CurrencyTotal | null;
  /** Positions still waiting for (or missing) a quote. */
  unpriced: number;
};

export const USDCOP = "USDCOP=X";

export function summarizePortfolio(
  positions: Position[],
  quotes: Record<string, Quote | undefined>,
  usdCop?: number,
): PortfolioSummary {
  const rows: PositionRow[] = positions.map((p) => {
    const cost = p.quantity * p.buy_price;
    const q = quotes[p.symbol];
    if (!q) return { ...p, cost };
    const value = p.quantity * q.price;
    return {
      ...p,
      currency: q.currency,
      price: q.price,
      cost,
      value,
      pnl: value - cost,
      pnlPercent: ((value - cost) / cost) * 100,
      dayChange: p.quantity * q.change,
    };
  });

  const byCurrency = new Map<string, CurrencyTotal>();
  for (const r of rows) {
    if (r.value == null) continue;
    const currency = r.currency ?? "?";
    const t = byCurrency.get(currency) ?? { currency, cost: 0, value: 0, pnl: 0, pnlPercent: 0, dayChange: 0 };
    t.cost += r.cost;
    t.value += r.value;
    t.pnl += r.pnl!;
    t.dayChange += r.dayChange!;
    byCurrency.set(currency, t);
  }
  const totals = [...byCurrency.values()].map((t) => ({ ...t, pnlPercent: (t.pnl / t.cost) * 100 }));

  const rate = (currency: string) => (currency === "COP" ? 1 : currency === "USD" ? usdCop : undefined);
  let totalCop: CurrencyTotal | null = null;
  if (totals.length > 0 && totals.every((t) => rate(t.currency))) {
    const sum = (k: "cost" | "value" | "pnl" | "dayChange") => totals.reduce((s, t) => s + t[k] * rate(t.currency)!, 0);
    const cost = sum("cost");
    totalCop = { currency: "COP", cost, value: sum("value"), pnl: sum("pnl"), pnlPercent: (sum("pnl") / cost) * 100, dayChange: sum("dayChange") };
  }

  return { rows, totals, totalCop, unpriced: rows.filter((r) => r.value == null).length };
}

// --- Consolidated view: dividends collected, comparison with an index, mix. ---

/** The index each position is measured against: the COLCAP ETF for pesos, the S&P 500 ETF otherwise. */
export function benchmarkFor(currency?: string): string {
  return currency === "COP" ? "ICOLCAP.CL" : "SPY";
}

const dayStart = (date: string) => Date.parse(`${date}T00:00:00Z`) / 1000;

/** Dividends whose ex-date fell after the purchase day, times the quantity held. */
export function dividendsReceived(p: Pick<Position, "quantity" | "bought_on">, dividends: Dividend[]): number {
  const bought = dayStart(p.bought_on) + 86_400;
  return dividends.filter((d) => d.time >= bought).reduce((s, d) => s + d.amount * p.quantity, 0);
}

/** Close of the first session on or after `date`; null when the history doesn't reach that far back. */
export function closeOn(candles: Candle[], date: string): number | null {
  const t = dayStart(date);
  if (!candles.length || candles[0].time > t + 7 * 86_400) return null;
  return candles.find((c) => c.time >= t)?.close ?? null;
}

export type PositionExtras = {
  dividends: number;
  benchmark: string;
  /** Benchmark's change from the purchase day to its latest close, as a fraction; null without history. */
  benchmarkReturn: number | null;
};

export function positionExtras(
  p: Pick<Position, "quantity" | "bought_on">,
  currency: string | undefined,
  own: { dividends: Dividend[] } | undefined,
  benchmark: { candles: Candle[] } | undefined,
): PositionExtras {
  const symbol = benchmarkFor(currency);
  const start = benchmark ? closeOn(benchmark.candles, p.bought_on) : null;
  const end = benchmark?.candles.at(-1)?.close;
  return {
    dividends: own ? dividendsReceived(p, own.dividends) : 0,
    benchmark: symbol,
    benchmarkReturn: start && end ? end / start - 1 : null,
  };
}

export type Market = "us" | "co" | "otros";
export const MARKET_LABEL: Record<Market, string> = { us: "EE. UU.", co: "Colombia", otros: "Índices y divisas" };

export function marketOf(symbol: string): Market {
  if (symbol.endsWith(".CL")) return "co";
  if (/[\^=]|-Y\./.test(symbol)) return "otros";
  return "us";
}

export type Slice = { key: string; label: string; valueCop: number; share: number };

/** Share of the portfolio's value (in COP) by market and by asset; positions in other currencies are left out. */
export function allocation(rows: PositionRow[], usdCop?: number): { byMarket: Slice[]; byAsset: Slice[] } {
  const rate = (c?: string) => (c === "COP" ? 1 : c === "USD" ? usdCop : undefined);
  const priced = rows.flatMap((r) => {
    const k = rate(r.currency);
    return r.value != null && k ? [{ symbol: r.symbol, valueCop: r.value * k }] : [];
  });
  const total = priced.reduce((s, r) => s + r.valueCop, 0);
  const group = (keyOf: (symbol: string) => string, labelOf: (key: string) => string) => {
    const sums = new Map<string, number>();
    for (const r of priced) sums.set(keyOf(r.symbol), (sums.get(keyOf(r.symbol)) ?? 0) + r.valueCop);
    return [...sums]
      .map(([key, valueCop]) => ({ key, label: labelOf(key), valueCop, share: total ? valueCop / total : 0 }))
      .sort((a, b) => b.valueCop - a.valueCop);
  };
  return {
    byMarket: group(marketOf, (k) => MARKET_LABEL[k as Market]),
    byAsset: group((s) => s, (s) => s),
  };
}

export type CurrencyComparison = {
  currency: string;
  benchmark: string;
  dividends: number;
  /** Return of the positions that have benchmark history, dividends included, as a fraction. */
  ownReturn: number | null;
  /** What the same money, on the same days, would have returned in the benchmark. */
  benchmarkReturn: number | null;
};

/** Per currency: dividends collected and the portfolio's return next to its benchmark's over the same purchase dates. */
export function compareWithBenchmark(rows: PositionRow[], extras: Record<string, PositionExtras | undefined>): CurrencyComparison[] {
  const byCurrency = new Map<string, { dividends: number; cost: number; value: number; bench: number }>();
  for (const r of rows) {
    const x = extras[r.id];
    if (r.value == null || !r.currency || !x) continue;
    const t = byCurrency.get(r.currency) ?? { dividends: 0, cost: 0, value: 0, bench: 0 };
    t.dividends += x.dividends;
    if (x.benchmarkReturn != null) {
      t.cost += r.cost;
      t.value += r.value + x.dividends;
      t.bench += r.cost * (1 + x.benchmarkReturn);
    }
    byCurrency.set(r.currency, t);
  }
  return [...byCurrency].map(([currency, t]) => ({
    currency,
    benchmark: benchmarkFor(currency),
    dividends: t.dividends,
    ownReturn: t.cost ? t.value / t.cost - 1 : null,
    benchmarkReturn: t.cost ? t.bench / t.cost - 1 : null,
  }));
}
