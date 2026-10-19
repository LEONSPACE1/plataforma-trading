import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getAnalysis } from "../market/provider";
import { UNIVERSE } from "../market/universe";
import { screenerMarket, screenerRow, type ScreenerRow } from "../screener";

// Keeps the screener table fresh from the every-minute scheduler: a handful of
// the stalest rows per run, so the free data sources never see a burst and
// the whole list renews about once a day.

const BATCH = 8;
const STALE_HOURS = 20;

/** Adds rows for the fixed list and for every symbol someone keeps in a list or portfolio. */
async function addMissingSymbols(db: SupabaseClient): Promise<number> {
  const [existing, items, positions] = await Promise.all([
    db.from("screener").select("symbol"),
    db.from("watchlist_items").select("symbol"),
    db.from("positions").select("symbol"),
  ]);
  const error = existing.error ?? items.error ?? positions.error;
  if (error) throw new Error(error.message);
  const have = new Set((existing.data ?? []).map((r) => r.symbol));
  const wanted = new Set([...UNIVERSE, ...(items.data ?? []).map((r) => r.symbol), ...(positions.data ?? []).map((r) => r.symbol)]);
  const missing = [...wanted].filter((s) => !have.has(s)).map((symbol) => ({ symbol, market: screenerMarket(symbol) }));
  if (missing.length) {
    const { error } = await db.from("screener").upsert(missing, { onConflict: "symbol", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }
  return missing.length;
}

export async function refreshScreener(db: SupabaseClient, now = new Date()): Promise<{ updated: number; errors: string[] }> {
  // New symbols are rare; look for them every ten minutes.
  if (now.getUTCMinutes() % 10 === 0) await addMissingSymbols(db);

  const staleBefore = new Date(now.getTime() - STALE_HOURS * 3600_000).toISOString();
  const { data, error } = await db
    .from("screener")
    .select("symbol, verdict, previous_verdict, verdict_changed_at")
    .or(`updated_at.is.null,updated_at.lt.${staleBefore}`)
    .order("updated_at", { ascending: true, nullsFirst: true })
    .limit(BATCH);
  if (error) throw new Error(error.message);

  const errors: string[] = [];
  let updated = 0;
  await Promise.all(
    ((data ?? []) as Pick<ScreenerRow, "symbol" | "verdict" | "previous_verdict" | "verdict_changed_at">[]).map(async (prev) => {
      let row: Partial<ScreenerRow>;
      try {
        const a = await getAnalysis(prev.symbol, { live: false });
        row = screenerRow(a, a.changePercent, prev, now);
      } catch (e) {
        // Stamp the failure too, so a dead symbol waits a day instead of retrying every minute.
        row = { error: e instanceof Error ? e.message : String(e), updated_at: now.toISOString() };
        errors.push(`screener ${prev.symbol}: ${row.error}`);
      }
      const { error } = await db.from("screener").update(row).eq("symbol", prev.symbol);
      if (error) errors.push(`screener ${prev.symbol}: ${error.message}`);
      else if (!row.error) updated++;
    }),
  );
  return { updated, errors };
}
