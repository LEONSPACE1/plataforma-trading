import { yahooSearch } from "@/lib/market/yahoo";
import { requireUser } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const denied = await requireUser(request);
  if (denied) return denied;

  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 1 || q.length > 40) return Response.json({ error: "Búsqueda inválida" }, { status: 400 });

  try {
    return Response.json({ results: await yahooSearch(q) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
