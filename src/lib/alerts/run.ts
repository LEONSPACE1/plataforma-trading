import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { refreshScreener } from "../jobs/screener";
import { sendDailySummaries } from "../jobs/summary";
import { getAnalysis, getQuote } from "../market/provider";
import { deliver } from "./notify";
import {
  checkIndicatorAlert,
  checkPriceAlert,
  checkSignalAlert,
  isIndicatorAlert,
  isPriceAlert,
  signalCheckDue,
  type Alert,
  type Notification,
} from "./rules";
import { processTelegramUpdates } from "./telegram";

// One pass over every active alert, run by the scheduler (Supabase pg_cron
// calls /api/cron/alerts every minute). Each symbol is fetched once per pass
// no matter how many users watch it.

export type RunReport = {
  alerts: number;
  fired: number;
  linkedTelegram: number;
  screenerUpdated: number;
  summariesSent: number;
  errors: string[];
};

function memo<T>(load: (symbol: string) => Promise<T>) {
  const cache = new Map<string, Promise<T>>();
  return (symbol: string) => {
    if (!cache.has(symbol)) cache.set(symbol, load(symbol));
    return cache.get(symbol)!;
  };
}

export async function runAlerts(db: SupabaseClient, now = new Date()): Promise<RunReport> {
  const report: RunReport = { alerts: 0, fired: 0, linkedTelegram: 0, screenerUpdated: 0, summariesSent: 0, errors: [] };

  if (process.env.TELEGRAM_BOT_TOKEN) {
    report.linkedTelegram = await processTelegramUpdates(db).catch((e) => {
      report.errors.push(`telegram: ${e instanceof Error ? e.message : String(e)}`);
      return 0;
    });
  }

  const { data, error } = await db.from("alerts").select("*").eq("active", true);
  if (error) throw new Error(error.message);
  const alerts = (data ?? []) as Alert[];
  report.alerts = alerts.length;

  const quote = memo(getQuote);
  const analysis = memo(getAnalysis);
  const iso = now.toISOString();

  const fire = async (alert: Alert, n: Notification, update: Partial<Alert>) => {
    // Only the run that flips the row notifies, so an overlapping run can't send the same alert twice.
    let claim = db.from("alerts").update({ ...update, last_triggered_at: iso }).eq("id", alert.id).eq("active", true);
    claim = alert.last_verdict ? claim.eq("last_verdict", alert.last_verdict) : claim;
    claim = alert.last_state ? claim.eq("last_state", alert.last_state) : claim;
    const { data, error } = await claim.select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) return;
    await db.from("alert_events").insert({ user_id: alert.user_id, alert_id: alert.id, symbol: alert.symbol, title: n.title, body: n.body });
    const delivery = await deliver(db, alert.user_id, n);
    report.errors.push(...delivery.errors);
    report.fired++;
  };

  await Promise.all(
    alerts.map(async (alert) => {
      try {
        if (isPriceAlert(alert.kind)) {
          const n = checkPriceAlert(alert, await quote(alert.symbol));
          if (n) await fire(alert, n, { active: false, last_checked_at: iso });
          return;
        }
        if (!signalCheckDue(alert, now)) return;
        if (isIndicatorAlert(alert.kind)) {
          const { state, notification } = checkIndicatorAlert(alert, await analysis(alert.symbol));
          if (notification) await fire(alert, notification, { last_state: state, last_checked_at: iso });
          else await db.from("alerts").update({ last_state: state, last_checked_at: iso }).eq("id", alert.id);
          return;
        }
        const { verdict, notification } = checkSignalAlert(alert, await analysis(alert.symbol));
        if (notification) await fire(alert, notification, { last_verdict: verdict, last_checked_at: iso });
        else await db.from("alerts").update({ last_verdict: verdict, last_checked_at: iso }).eq("id", alert.id);
      } catch (e) {
        report.errors.push(`${alert.symbol}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }),
  );

  // The same run keeps the screener fresh and sends the end-of-day summaries.
  const safe = <T,>(what: string, job: Promise<T>) =>
    job.catch((e) => {
      report.errors.push(`${what}: ${e instanceof Error ? e.message : String(e)}`);
      return null;
    });
  const [screener, summaries] = await Promise.all([
    safe("screener", refreshScreener(db, now)),
    safe("resumen", sendDailySummaries(db, now)),
  ]);
  report.screenerUpdated = screener?.updated ?? 0;
  report.summariesSent = summaries?.sent ?? 0;
  report.errors.push(...(screener?.errors ?? []), ...(summaries?.errors ?? []));
  return report;
}
