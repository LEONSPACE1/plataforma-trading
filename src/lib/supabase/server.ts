import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * Rejects requests without a valid Supabase session token, so the market-data
 * routes (and the API keys behind them) only serve invited members.
 */
export async function requireUser(request: Request): Promise<Response | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return Response.json({ error: "Supabase no está configurado" }, { status: 500 });

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ error: "No autenticado" }, { status: 401 });

  const { data, error } = await createClient(url, key).auth.getUser(token);
  if (error || !data.user) return Response.json({ error: "Sesión inválida" }, { status: 401 });
  return null;
}
