import { getAnalysis } from "@/lib/market/provider";
import { isValidSymbol } from "@/lib/market/symbols";
import { requireUser } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const denied = await requireUser(request);
  if (denied) return denied;

  const symbol = new URL(request.url).searchParams.get("symbol")?.toUpperCase() ?? "";
  if (!isValidSymbol(symbol)) return Response.json({ error: "Símbolo inválido" }, { status: 400 });

  try {
    return Response.json({ analysis: await getAnalysis(symbol) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
