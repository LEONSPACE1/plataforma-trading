// Classic technical indicators over a closing-price series. Each function
// returns an array aligned with its input, with null where there isn't yet
// enough history, so callers can plot them directly against the candles.

export type Series = (number | null)[];

/** Simple moving average. */
export function sma(values: number[], period: number): Series {
  const out: Series = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

/** Exponential moving average, seeded with the SMA of the first `period` values. */
export function ema(values: number[], period: number): Series {
  const out: Series = new Array(values.length).fill(null);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Relative Strength Index with Wilder's smoothing (the standard 14-period RSI). */
export function rsi(values: number[], period = 14): Series {
  const out: Series = new Array(values.length).fill(null);
  if (values.length <= period) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= period; i++) {
    const d = values[i] - values[i - 1];
    if (d > 0) gain += d;
    else loss -= d;
  }
  gain /= period;
  loss /= period;
  const value = () => (loss === 0 ? (gain === 0 ? 50 : 100) : 100 - 100 / (1 + gain / loss));
  out[period] = value();
  for (let i = period + 1; i < values.length; i++) {
    const d = values[i] - values[i - 1];
    gain = (gain * (period - 1) + Math.max(d, 0)) / period;
    loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
    out[i] = value();
  }
  return out;
}

export type Macd = { macd: Series; signal: Series; histogram: Series };

/** MACD (12, 26, 9): fast EMA minus slow EMA, its 9-period EMA, and the gap between them. */
export function macd(values: number[], fast = 12, slow = 26, signalPeriod = 9): Macd {
  const f = ema(values, fast);
  const s = ema(values, slow);
  const line: Series = values.map((_, i) => (f[i] != null && s[i] != null ? f[i]! - s[i]! : null));
  const start = line.findIndex((v) => v != null);
  const signal: Series = new Array(values.length).fill(null);
  if (start >= 0) {
    const tail = ema(line.slice(start) as number[], signalPeriod);
    tail.forEach((v, j) => (signal[start + j] = v));
  }
  const histogram: Series = line.map((v, i) => (v != null && signal[i] != null ? v - signal[i]! : null));
  return { macd: line, signal, histogram };
}

export type Bollinger = { middle: Series; upper: Series; lower: Series };

/** Bollinger Bands: SMA ± `mult` population standard deviations. */
export function bollinger(values: number[], period = 20, mult = 2): Bollinger {
  const middle = sma(values, period);
  const upper: Series = new Array(values.length).fill(null);
  const lower: Series = new Array(values.length).fill(null);
  for (let i = period - 1; i < values.length; i++) {
    const m = middle[i]!;
    let sq = 0;
    for (let j = i - period + 1; j <= i; j++) sq += (values[j] - m) ** 2;
    const sd = Math.sqrt(sq / period);
    upper[i] = m + mult * sd;
    lower[i] = m - mult * sd;
  }
  return { middle, upper, lower };
}

/** Last non-null value of a series. */
export function last(series: Series): number | null {
  for (let i = series.length - 1; i >= 0; i--) if (series[i] != null) return series[i];
  return null;
}
