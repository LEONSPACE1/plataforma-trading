import type { EarningsEvent, Quote } from "./types";

// Finnhub free plan: real-time US stock quotes, 60 calls/min, personal use.
const QUOTE_URL = "https://finnhub.io/api/v1/quote";
// Earnings calendar (free plan, US companies).
const EARNINGS_URL = "https://finnhub.io/api/v1/calendar/earnings";

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

type FinnhubEarnings = {
  earningsCalendar?: { symbol: string; date: string; hour?: string; epsEstimate?: number | null; revenueEstimate?: number | null }[];
};

export function parseFinnhubEarnings(data: FinnhubEarnings): EarningsEvent[] {
  return (data.earningsCalendar ?? [])
    .map((e) => ({
      symbol: e.symbol,
      date: e.date,
      hour: e.hour || null,
      epsEstimate: e.epsEstimate ?? null,
      revenueEstimate: e.revenueEstimate ?? null,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Upcoming earnings reports for one US company between two YYYY-MM-DD dates. */
export async function finnhubEarnings(symbol: string, from: string, to: string, apiKey: string): Promise<EarningsEvent[]> {
  const url = `${EARNINGS_URL}?symbol=${encodeURIComponent(symbol)}&from=${from}&to=${to}`;
  const res = await fetch(url, { headers: { "X-Finnhub-Token": apiKey }, cache: "no-store" });
  if (!res.ok) throw new Error(`Finnhub resultados ${symbol}: HTTP ${res.status}`);
  return parseFinnhubEarnings((await res.json()) as FinnhubEarnings);
}
