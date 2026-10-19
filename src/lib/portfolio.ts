import type { Quote } from "./market/types";

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
