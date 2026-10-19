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
