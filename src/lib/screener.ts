import type { Analysis, Verdict } from "./analysis/signal";

// The screener table: one row per asset with the numbers people filter on.
// The scheduled job (src/lib/jobs/screener.ts) refreshes a few rows a minute.

export type ScreenerMarket = "us" | "co" | "index" | "fx";

export type ScreenerRow = {
  symbol: string;
  name: string | null;
  market: ScreenerMarket;
  currency: string | null;
  price: number | null;
  change_percent: number | null;
  verdict: Verdict | null;
  previous_verdict: Verdict | null;
  verdict_changed_at: string | null;
  score: number | null;
  technical_score: number | null;
  fundamental_score: number | null;
  rsi: number | null;
  pe: number | null;
  dividend_yield: number | null;
  net_margin: number | null;
  debt_to_equity: number | null;
  above_sma200: boolean | null;
  golden_cross: boolean | null;
  error: string | null;
  updated_at: string | null;
};

export const SCREENER_MARKET_LABEL: Record<ScreenerMarket, string> = {
  us: "EE. UU.",
  co: "Colombia",
  index: "Índices",
  fx: "Divisas",
};

export function screenerMarket(symbol: string): ScreenerMarket {
  if (symbol.endsWith(".CL")) return "co";
  if (symbol.startsWith("^")) return "index";
  if (/=X$|-Y\./.test(symbol)) return "fx";
  return "us";
}

const round = (v: number | null | undefined, digits: number) => (v == null ? null : Number(v.toFixed(digits)));

/** The row to store for a fresh analysis; `previous` is the stored row, to track when the verdict changed. */
export function screenerRow(
  a: Analysis & { name?: string },
  changePercent: number | null,
  previous: Pick<ScreenerRow, "verdict" | "previous_verdict" | "verdict_changed_at"> | null,
  now: Date,
): Omit<ScreenerRow, "symbol" | "market"> {
  const t = a.technical;
  const f = a.fundamentals;
  const changed = previous?.verdict != null && previous.verdict !== a.verdict;
  return {
    name: a.name ?? null,
    currency: a.currency ?? null,
    price: a.price,
    change_percent: round(changePercent, 2),
    verdict: a.verdict,
    previous_verdict: changed ? previous!.verdict : (previous?.previous_verdict ?? null),
    verdict_changed_at: changed ? now.toISOString() : (previous?.verdict_changed_at ?? null),
    score: a.score,
    technical_score: a.technicalScore,
    fundamental_score: a.fundamentalScore,
    rsi: round(t.rsi14, 1),
    pe: round(f?.pe, 1),
    dividend_yield: round(f?.dividendYield, 4),
    net_margin: round(f?.netMargin, 4),
    debt_to_equity: round(f?.debtToEquity, 2),
    above_sma200: t.sma200 == null ? null : a.price > t.sma200,
    golden_cross: t.sma50 == null || t.sma200 == null ? null : t.sma50 > t.sma200,
    error: null,
    updated_at: now.toISOString(),
  };
}

export type ScreenerFilters = {
  market: ScreenerMarket | "all";
  verdict: Verdict | "all";
  rsiMin: number | null;
  rsiMax: number | null;
  peMax: number | null;
  dividendMin: number | null;
  aboveSma200: boolean;
  goldenCross: boolean;
};

export const NO_FILTERS: ScreenerFilters = {
  market: "all",
  verdict: "all",
  rsiMin: null,
  rsiMax: null,
  peMax: null,
  dividendMin: null,
  aboveSma200: false,
  goldenCross: false,
};

/** Rows matching every filter that is set; a filter on a value the row lacks (no P/E) leaves the row out. */
export function filterScreener(rows: ScreenerRow[], f: ScreenerFilters): ScreenerRow[] {
  return rows.filter(
    (r) =>
      r.verdict != null &&
      (f.market === "all" || r.market === f.market) &&
      (f.verdict === "all" || r.verdict === f.verdict) &&
      (f.rsiMin == null || (r.rsi != null && r.rsi >= f.rsiMin)) &&
      (f.rsiMax == null || (r.rsi != null && r.rsi <= f.rsiMax)) &&
      (f.peMax == null || (r.pe != null && r.pe <= f.peMax)) &&
      (f.dividendMin == null || (r.dividend_yield != null && r.dividend_yield * 100 >= f.dividendMin)) &&
      (!f.aboveSma200 || r.above_sma200 === true) &&
      (!f.goldenCross || r.golden_cross === true),
  );
}
