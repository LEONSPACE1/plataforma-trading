import { benchmarkFor, positionExtras, type PositionExtras } from "@/lib/portfolio";
import { isValidSymbol } from "@/lib/market/symbols";
import { getTrm, type Trm } from "@/lib/market/trm";
import { yahooDailyHistory } from "@/lib/market/yahoo";
import { requireUser } from "@/lib/supabase/server";

type Body = { positions?: { id: string; symbol: string; quantity: number; bought_on: string; currency?: string }[] };

/**
 * POST {positions} → dividends each purchase has collected, how the matching
 * index did over the same days, and today's official TRM.
 */
export async function POST(request: Request) {
  const denied = await requireUser(request);
  if (denied) return denied;

  const { positions = [] } = (await request.json().catch(() => ({}))) as Body;
  const valid = positions.filter(
    (p) => isValidSymbol(p.symbol) && Number(p.quantity) > 0 && /^\d{4}-\d{2}-\d{2}$/.test(p.bought_on),
  );
  if (valid.length > 100) return Response.json({ error: "Demasiadas posiciones" }, { status: 400 });

  const symbols = [...new Set([...valid.map((p) => p.symbol), ...valid.map((p) => benchmarkFor(p.currency))])];
  const histories = new Map(
    await Promise.all(symbols.map(async (s) => [s, await yahooDailyHistory(s, "5y").catch(() => undefined)] as const)),
  );
  const extras: Record<string, PositionExtras> = {};
  for (const p of valid) {
    extras[p.id] = positionExtras(
      { quantity: Number(p.quantity), bought_on: p.bought_on },
      p.currency,
      histories.get(p.symbol),
      histories.get(benchmarkFor(p.currency)),
    );
  }
  const trm: Trm | null = await getTrm().catch(() => null);
  return Response.json({ extras, trm });
}
