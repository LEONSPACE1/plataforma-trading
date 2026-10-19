import "server-only";

import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

/**
 * Resolves the Supabase user behind the request's bearer token, or the error
 * response to send back, so the API routes (and the keys behind them) only
 * serve invited members.
 */
export async function authenticate(request: Request): Promise<{ user: User; denied?: never } | { user?: never; denied: Response }> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return { denied: Response.json({ error: "Supabase no está configurado" }, { status: 500 }) };

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return { denied: Response.json({ error: "No autenticado" }, { status: 401 }) };

  const { data, error } = await createClient(url, key).auth.getUser(token);
  if (error || !data.user) return { denied: Response.json({ error: "Sesión inválida" }, { status: 401 }) };
  return { user: data.user };
}

/** Rejects requests without a valid session; returns null when the caller may proceed. */
export async function requireUser(request: Request): Promise<Response | null> {
  return (await authenticate(request)).denied ?? null;
}

/**
 * Service-role client for server jobs (alert evaluation, Telegram linking).
 * It bypasses RLS, so only use it for rows the code itself scopes to a user.
 */
export function adminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY (ver guía de alertas)");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
