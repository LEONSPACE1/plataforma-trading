import { getEvents } from "@/lib/market/events";
import { parseSymbolList } from "@/lib/market/symbols";
import { requireUser } from "@/lib/supabase/server";

/** Next earnings report and estimated next dividend for each symbol. */
export async function GET(request: Request) {
  const denied = await requireUser(request);
  if (denied) return denied;

  const symbols = parseSymbolList(new URL(request.url).searchParams.get("symbols"), 60);
  if (!symbols) return Response.json({ error: "Lista de símbolos inválida" }, { status: 400 });

  const results = await Promise.all(
    symbols.map((symbol) =>
      getEvents(symbol).then(
        (events) => ({ symbol, events }),
        (e) => ({ symbol, error: e instanceof Error ? e.message : String(e) }),
      ),
    ),
  );
  return Response.json({ results });
}
