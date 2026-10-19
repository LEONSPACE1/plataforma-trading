export type MarketGroup = "us-stocks" | "us-indices" | "co-stocks" | "co-indices" | "fx";

export type Quote = {
  symbol: string;
  name?: string;
  price: number;
  change: number;
  changePercent: number;
  previousClose: number;
  currency?: string;
  /** Unix seconds of the last trade the provider reported. */
  time: number;
  /** Minutes the provider says the quote lags the exchange; 0 means real time. */
  delayMinutes: number;
  source: "finnhub" | "yahoo";
};

export type Candle = {
  /** Unix seconds. */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type SearchResult = {
  symbol: string;
  name: string;
  exchange: string;
  type: string;
};

export type ChartRange = "1d" | "5d" | "1mo" | "6mo" | "1y" | "5y";

export type Dividend = { /** Unix seconds (ex-date). */ time: number; amount: number };

/**
 * Raw figures from the company's latest reports, in the reporting currency
 * (which can differ from the trading currency, e.g. an ADR priced in USD).
 */
export type Fundamentals = {
  currency?: string;
  /** Date of the newest report used, YYYY-MM-DD. */
  asOf?: string;
  eps?: number;
  revenue?: number;
  grossProfit?: number;
  operatingIncome?: number;
  netIncome?: number;
  totalDebt?: number;
  equity?: number;
};

export type NewsItem = {
  id: string;
  title: string;
  publisher: string;
  url: string;
  /** Unix seconds. */
  time: number;
  related: string[];
};

export type EarningsEvent = {
  symbol: string;
  /** YYYY-MM-DD. */
  date: string;
  /** "bmo" before the open, "amc" after the close, "dmh" during market hours. */
  hour: string | null;
  epsEstimate: number | null;
  revenueEstimate: number | null;
};
