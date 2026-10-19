import type { Quote } from "./types";

// Finnhub free plan: real-time US stock quotes, 60 calls/min, personal use.
const QUOTE_URL = "https://finnhub.io/api/v1/quote";

type FinnhubQuote = { c: number; d: number | null; dp: number | null; pc: number; t: number };

export function parseFinnhubQuote(symbol: string, data: FinnhubQuote): Quote {
  // Finnhub answers unknown symbols with all zeros instead of an error.
  if (!data.c && !data.t) throw new Error(`Finnhub ${symbol}: símbolo sin datos`);
  const change = data.d ?? data.c - data.pc;
  return {
    symbol,
    price: data.c,
    previousClose: data.pc,
    change,
    changePercent: data.dp ?? (data.pc ? (change / data.pc) * 100 : 0),
    currency: "USD",
    time: data.t,
    delayMinutes: 0,
    source: "finnhub",
  };
}

export async function finnhubQuote(symbol: string, apiKey: string): Promise<Quote> {
  const res = await fetch(`${QUOTE_URL}?symbol=${encodeURIComponent(symbol)}`, {
    headers: { "X-Finnhub-Token": apiKey },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Finnhub ${symbol}: HTTP ${res.status}`);
  return parseFinnhubQuote(symbol, (await res.json()) as FinnhubQuote);
}
