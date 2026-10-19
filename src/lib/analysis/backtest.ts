import type { Candle } from "../market/types";
import { computeIndicators, mean, technicalFactorsAt, verdictFor } from "./signal";

// Replays the technical signal over past candles: buy the session after it
// turns to Comprar, sell the session after it turns to Vender, stay put on
// Mantener. Fundamentals are left out because only today's reports are
// available, not the ones that were public on each past day.

export type Trade = {
  entryTime: number;
  entryPrice: number;
  exitTime: number | null;
  exitPrice: number | null;
  /** Fraction, e.g. 0.12 for +12 %; for an open trade, measured at the last close. */
  return: number;
};

export type EquityPoint = { time: number; strategy: number; buyHold: number };

export type Backtest = {
  from: number;
  to: number;
  strategyReturn: number;
  buyHoldReturn: number;
  strategyMaxDrawdown: number;
  buyHoldMaxDrawdown: number;
  /** Share of sessions with money in the asset. */
  exposure: number;
  trades: Trade[];
  winRate: number | null;
  /** Both curves start at 100. */
  equity: EquityPoint[];
};

function maxDrawdown(values: number[]): number {
  let peak = -Infinity;
  let worst = 0;
  for (const v of values) {
    peak = Math.max(peak, v);
    worst = Math.min(worst, v / peak - 1);
  }
  return worst;
}

export function backtestSignal(candles: Candle[]): Backtest {
  const ind = computeIndicators(candles);
  // Start once the 200-day average exists, so every rule takes part from day one.
  const start = ind.sma200.findIndex((v) => v != null);
  if (start < 0 || start >= candles.length - 2) {
    throw new Error("Se necesitan más de 200 sesiones de historia para probar la señal");
  }

  const trades: Trade[] = [];
  let open: Trade | null = null;
  let cash = 100;
  let units = 0;
  let invested = 0;
  const firstPrice = candles[start + 1].open;
  const equity: EquityPoint[] = [];

  for (let i = start + 1; i < candles.length; i++) {
    // Yesterday's close decides; we act at today's open.
    const verdict = verdictFor(Math.round(mean(technicalFactorsAt(ind, i - 1).map((f) => f.vote)) * 100));
    const c = candles[i];
    if (!open && verdict === "comprar") {
      units = cash / c.open;
      cash = 0;
      open = { entryTime: c.time, entryPrice: c.open, exitTime: null, exitPrice: null, return: 0 };
      trades.push(open);
    } else if (open && verdict === "vender") {
      cash = units * c.open;
      units = 0;
      open.exitTime = c.time;
      open.exitPrice = c.open;
      open.return = c.open / open.entryPrice - 1;
      open = null;
    }
    if (open) invested++;
    equity.push({ time: c.time, strategy: cash + units * c.close, buyHold: (100 * c.close) / firstPrice });
  }
  const lastClose = candles.at(-1)!.close;
  if (open) open.return = lastClose / open.entryPrice - 1;

  const closed = trades.filter((t) => t.exitTime != null);
  return {
    from: candles[start + 1].time,
    to: candles.at(-1)!.time,
    strategyReturn: equity.at(-1)!.strategy / 100 - 1,
    buyHoldReturn: lastClose / firstPrice - 1,
    strategyMaxDrawdown: maxDrawdown(equity.map((e) => e.strategy)),
    buyHoldMaxDrawdown: maxDrawdown(equity.map((e) => e.buyHold)),
    exposure: invested / equity.length,
    trades,
    winRate: closed.length ? closed.filter((t) => t.return > 0).length / closed.length : null,
    equity,
  };
}
