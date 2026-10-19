import { backtestSignal } from "@/lib/analysis/backtest";
import { isValidSymbol } from "@/lib/market/symbols";
import { yahooDailyHistory } from "@/lib/market/yahoo";
import { requireUser } from "@/lib/supabase/server";

/** Replays the technical signal over five years of daily candles. */
export async function GET(request: Request) {
  const denied = await requireUser(request);
  if (denied) return denied;

  const symbol = new URL(request.url).searchParams.get("symbol")?.toUpperCase() ?? "";
  if (!isValidSymbol(symbol)) return Response.json({ error: "Símbolo inválido" }, { status: 400 });

  try {
    const { candles } = await yahooDailyHistory(symbol, "5y");
    return Response.json({ backtest: backtestSignal(candles) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
