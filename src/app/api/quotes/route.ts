import { getQuotes } from "@/lib/market/provider";
import { parseSymbolList } from "@/lib/market/symbols";
import { requireUser } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const denied = await requireUser(request);
  if (denied) return denied;

  const symbols = parseSymbolList(new URL(request.url).searchParams.get("symbols"));
  if (!symbols) return Response.json({ error: "Parámetro symbols inválido" }, { status: 400 });

  return Response.json({ results: await getQuotes(symbols) });
}
