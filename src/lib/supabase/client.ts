"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export const SUPABASE_CONFIG_ERROR =
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    ? null
    : "Faltan NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY (ver README).";

/** Browser Supabase client; created lazily so builds don't need the env vars. */
export function supabase(): SupabaseClient {
  if (!client) {
    if (SUPABASE_CONFIG_ERROR) throw new Error(SUPABASE_CONFIG_ERROR);
    client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  }
  return client;
}

/** fetch() to our own /api routes with the signed-in user's token attached; `body` is sent as JSON. */
export async function apiFetch<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const { data } = await supabase().auth.getSession();
  const token = data.session?.access_token;
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  if (init?.body !== undefined) headers["Content-Type"] = "application/json";
  const res = await fetch(path, {
    method: init?.method ?? (init?.body !== undefined ? "POST" : "GET"),
    headers,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error ?? `HTTP ${res.status}`);
  return body as T;
}
