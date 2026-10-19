import { getCandles } from "@/lib/market/provider";
import { isValidSymbol } from "@/lib/market/symbols";
import type { ChartRange } from "@/lib/market/types";
import { requireUser } from "@/lib/supabase/server";

const RANGES: ChartRange[] = ["1d", "5d", "1mo", "6mo", "1y", "5y"];

export async function GET(request: Request) {
  const denied = await requireUser(request);
  if (denied) return denied;

  const params = new URL(request.url).searchParams;
  const symbol = params.get("symbol")?.toUpperCase() ?? "";
  const range = (params.get("range") ?? "6mo") as ChartRange;
  if (!isValidSymbol(symbol) || !RANGES.includes(range)) {
    return Response.json({ error: "Parámetros inválidos" }, { status: 400 });
  }

  try {
    return Response.json({ candles: await getCandles(symbol, range) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
