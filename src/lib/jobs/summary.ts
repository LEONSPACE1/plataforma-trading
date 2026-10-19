import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { deliver, type DeliveryReport } from "../alerts/notify";
import { bogotaDate, buildSummary, summaryDue, type SignalChange } from "../alerts/summary";
import type { Verdict } from "../analysis/signal";
import { getEvents } from "../market/events";
import { getQuote } from "../market/provider";
import type { Quote } from "../market/types";
import { summarizePortfolio, USDCOP, type Position } from "../portfolio";

// Sends each member their end-of-day summary once per weekday, from the
// every-minute scheduler. A row in daily_summaries claims the day first, so
// overlapping runs never send it twice.

type Memo = Map<string, Promise<Quote | undefined>>;

async function summaryFor(db: SupabaseClient, userId: string, now: Date, memo: Memo) {
  const [items, rows] = await Promise.all([
    db.from("watchlist_items").select("symbol").eq("user_id", userId),
    db.from("positions").select("*").eq("user_id", userId),
  ]);
  const positions = ((rows.data ?? []) as Position[]).map((p) => ({ ...p, quantity: Number(p.quantity), buy_price: Number(p.buy_price) }));
  const symbols = [...new Set([...(items.data ?? []).map((r) => r.symbol as string), ...positions.map((p) => p.symbol)])];
  if (!symbols.length) return null;

  const quote = (s: string) => {
    if (!memo.has(s)) memo.set(s, getQuote(s).catch(() => undefined));
    return memo.get(s)!;
  };
  const quotes = Object.fromEntries(await Promise.all(symbols.map(async (s) => [s, await quote(s)] as const)));
  const usdCop = positions.length ? (await quote(USDCOP))?.price : undefined;

  const since = new Date(now.getTime() - 24 * 3600_000).toISOString();
  const { data: changed } = await db
    .from("screener")
    .select("symbol, verdict, previous_verdict")
    .in("symbol", symbols)
    .gte("verdict_changed_at", since);
  const signalChanges: SignalChange[] = (changed ?? [])
    .filter((r) => r.previous_verdict && r.verdict)
    .map((r) => ({ symbol: r.symbol, from: r.previous_verdict as Verdict, to: r.verdict as Verdict }));

  const events = (await Promise.all(symbols.map((s) => getEvents(s).catch(() => null)))).filter((e) => e != null);

  return buildSummary({
    day: bogotaDate(now).day,
    quotes,
    portfolio: positions.length ? summarizePortfolio(positions, quotes, usdCop) : null,
    signalChanges,
    events,
  });
}

/** Builds and sends today's summary to one user right away (the "send it now" button). */
export async function sendSummaryNow(db: SupabaseClient, userId: string, now = new Date()): Promise<DeliveryReport | null> {
  const n = await summaryFor(db, userId, now, new Map());
  return n ? deliver(db, userId, n) : null;
}

export async function sendDailySummaries(db: SupabaseClient, now = new Date()): Promise<{ sent: number; errors: string[] }> {
  const report = { sent: 0, errors: [] as string[] };
  if (!summaryDue(now)) return report;
  const { day } = bogotaDate(now);

  // Members with a channel to receive it, minus those who turned it off or already got today's.
  const [push, telegram, optedOut, done] = await Promise.all([
    db.from("push_subscriptions").select("user_id"),
    db.from("telegram_links").select("user_id").not("chat_id", "is", null),
    db.from("user_settings").select("user_id").eq("daily_summary", false),
    db.from("daily_summaries").select("user_id").eq("day", day),
  ]);
  const error = push.error ?? telegram.error ?? optedOut.error ?? done.error;
  if (error) throw new Error(error.message);
  const skip = new Set([...(optedOut.data ?? []), ...(done.data ?? [])].map((r) => r.user_id));
  const users = [...new Set([...(push.data ?? []), ...(telegram.data ?? [])].map((r) => r.user_id as string))].filter((u) => !skip.has(u));

  const memo: Memo = new Map();
  for (const userId of users) {
    const { data: claimed, error } = await db
      .from("daily_summaries")
      .upsert({ user_id: userId, day }, { onConflict: "user_id,day", ignoreDuplicates: true })
      .select("user_id");
    if (error) {
      report.errors.push(`resumen: ${error.message}`);
      continue;
    }
    if (!claimed?.length) continue;
    try {
      const n = await summaryFor(db, userId, now, memo);
      if (!n) continue;
      const delivery = await deliver(db, userId, n);
      report.errors.push(...delivery.errors);
      report.sent++;
    } catch (e) {
      report.errors.push(`resumen: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return report;
}
