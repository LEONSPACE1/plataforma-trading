"use client";

import { useCallback, useEffect, useState } from "react";
import type { QuoteResult } from "@/lib/market/provider";
import { apiFetch, supabase } from "@/lib/supabase/client";

export const QUOTE_REFRESH_MS = 15_000;

/** Polls /api/quotes while the tab is visible. */
export function useQuotes(symbols: string[]) {
  const [results, setResults] = useState<Record<string, QuoteResult>>({});
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const key = symbols.join(",");

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    const load = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const { results } = await apiFetch<{ results: QuoteResult[] }>(
          `/api/quotes?symbols=${encodeURIComponent(key)}`,
        );
        if (cancelled) return;
        setResults((prev) => ({ ...prev, ...Object.fromEntries(results.map((r) => [r.symbol, r])) }));
        setUpdatedAt(new Date());
      } catch {
        // Keep the last good prices on screen; the next tick retries.
      }
    };
    load();
    const timer = setInterval(load, QUOTE_REFRESH_MS);
    document.addEventListener("visibilitychange", load);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", load);
    };
  }, [key]);

  return { results, updatedAt };
}

export type Watchlist = { id: string; name: string; symbols: string[] };

/**
 * The user's lists, kept in sync across devices through Supabase Realtime:
 * any insert/delete on another device triggers a reload here.
 */
export function useWatchlists() {
  const [lists, setLists] = useState<Watchlist[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const db = supabase();
    const [{ data: wl, error: e1 }, { data: items, error: e2 }] = await Promise.all([
      db.from("watchlists").select("id, name").order("created_at"),
      db.from("watchlist_items").select("watchlist_id, symbol").order("created_at"),
    ]);
    if (e1 || e2) {
      setError((e1 ?? e2)!.message);
      return;
    }
    setError(null);
    setLists(
      (wl ?? []).map((w) => ({
        id: w.id,
        name: w.name,
        symbols: (items ?? []).filter((i) => i.watchlist_id === w.id).map((i) => i.symbol),
      })),
    );
  }, []);

  useEffect(() => {
    // Initial load; setState happens after the awaited queries, not synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload();
    const channel = supabase()
      .channel("watchlists-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "watchlists" }, reload)
      .on("postgres_changes", { event: "*", schema: "public", table: "watchlist_items" }, reload)
      .subscribe();
    return () => {
      supabase().removeChannel(channel);
    };
  }, [reload]);

  const addSymbol = useCallback(
    async (watchlistId: string, symbol: string) => {
      const { error } = await supabase().from("watchlist_items").insert({ watchlist_id: watchlistId, symbol });
      if (error && error.code !== "23505") setError(error.message); // 23505: already in the list
      await reload();
    },
    [reload],
  );

  const removeSymbol = useCallback(
    async (watchlistId: string, symbol: string) => {
      const { error } = await supabase()
        .from("watchlist_items")
        .delete()
        .eq("watchlist_id", watchlistId)
        .eq("symbol", symbol);
      if (error) setError(error.message);
      await reload();
    },
    [reload],
  );

  const createList = useCallback(
    async (name: string) => {
      const { error } = await supabase().from("watchlists").insert({ name });
      if (error) setError(error.message);
      await reload();
    },
    [reload],
  );

  const deleteList = useCallback(
    async (id: string) => {
      const { error } = await supabase().from("watchlists").delete().eq("id", id);
      if (error) setError(error.message);
      await reload();
    },
    [reload],
  );

  return { lists, error, addSymbol, removeSymbol, createList, deleteList };
}

/**
 * The signed-in user's rows of one table (RLS limits them to their own),
 * reloaded whenever any device changes the table through Supabase Realtime.
 */
export function useOwnRows<T>(table: string, order: { column: string; ascending?: boolean } = { column: "created_at" }) {
  const [rows, setRows] = useState<T[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { column, ascending = true } = order;

  const reload = useCallback(async () => {
    const { data, error } = await supabase().from(table).select("*").order(column, { ascending });
    setError(error?.message ?? null);
    if (!error) setRows((data ?? []) as T[]);
  }, [table, column, ascending]);

  useEffect(() => {
    // Initial load; setState happens after the awaited query, not synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    reload();
    const channel = supabase()
      .channel(`${table}-sync-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table }, reload)
      .subscribe();
    return () => {
      supabase().removeChannel(channel);
    };
  }, [table, reload]);

  /** Runs a write and reloads; returns the error message, if any. */
  const mutate = useCallback(
    async (write: (db: ReturnType<typeof supabase>) => PromiseLike<{ error: { message: string } | null }>) => {
      const { error } = await write(supabase());
      setError(error?.message ?? null);
      await reload();
      return error?.message ?? null;
    },
    [reload],
  );

  return { rows, error, mutate };
}
