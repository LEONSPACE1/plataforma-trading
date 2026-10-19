import { VERDICT_LABEL, type Notification } from "./rules";
import type { Verdict } from "../analysis/signal";
import type { AssetEvents } from "../market/events";
import type { Quote } from "../market/types";
import type { PortfolioSummary } from "../portfolio";

// The end-of-day message: what moved in the user's lists and portfolio,
// which signals changed and what is coming in the next sessions. Pure, so it
// can be tested; ../jobs/summary.ts gathers the data and sends it.

/** Colombia has no daylight saving time: Bogotá is always UTC−5. */
const BOGOTA_OFFSET_MS = -5 * 3600_000;
/** 16:15 in Bogotá, after the BVC (16:00) and New York (15:00 or 16:00 Bogotá time) have closed. */
export const SUMMARY_HOUR = 16;
export const SUMMARY_MINUTE = 15;

export function bogotaDate(now: Date): { day: string; weekday: number; minutes: number } {
  const local = new Date(now.getTime() + BOGOTA_OFFSET_MS);
  return {
    day: local.toISOString().slice(0, 10),
    weekday: local.getUTCDay(),
    minutes: local.getUTCHours() * 60 + local.getUTCMinutes(),
  };
}

/** Weekdays from 16:15 Bogotá time until midnight. */
export function summaryDue(now: Date): boolean {
  const { weekday, minutes } = bogotaDate(now);
  return weekday >= 1 && weekday <= 5 && minutes >= SUMMARY_HOUR * 60 + SUMMARY_MINUTE;
}

/** The next weekday after `day` (YYYY-MM-DD): Friday → Monday. */
export function nextSession(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  do d.setUTCDate(d.getUTCDate() + 1);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return d.toISOString().slice(0, 10);
}

export type SignalChange = { symbol: string; from: Verdict; to: Verdict };

export type SummaryInput = {
  day: string;
  quotes: Record<string, Quote | undefined>;
  portfolio: PortfolioSummary | null;
  signalChanges: SignalChange[];
  events: AssetEvents[];
};

const fmt = (n: number, digits = 2) => n.toLocaleString("es-CO", { maximumFractionDigits: digits });
const signedPct = (n: number) => `${n > 0 ? "+" : ""}${fmt(n)} %`;
const signedMoney = (n: number, currency: string) => `${n > 0 ? "+" : ""}${fmt(n, currency === "COP" ? 0 : 2)} ${currency}`;
const shortDate = (day: string) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

export function buildSummary({ day, quotes, portfolio, signalChanges, events }: SummaryInput): Notification | null {
  const lines: string[] = [];

  const moves = Object.values(quotes)
    .filter((q): q is Quote => q != null)
    .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
    .slice(0, 5);
  if (moves.length) {
    lines.push("Lo que más se movió:");
    for (const q of moves) lines.push(`• ${q.symbol} ${signedPct(q.changePercent)} (${fmt(q.price)}${q.currency ? ` ${q.currency}` : ""})`);
  }

  if (portfolio && portfolio.totals.length) {
    const parts = portfolio.totals.map((t) => `${signedMoney(t.dayChange, t.currency)}`);
    const total = portfolio.totalCop && portfolio.totals.length > 1 ? `; total ${signedMoney(portfolio.totalCop.dayChange, "COP")}` : "";
    lines.push(`Tu portafolio hoy: ${parts.join(" · ")}${total}.`);
  }

  if (signalChanges.length) {
    lines.push("Señales que cambiaron:");
    for (const c of signalChanges) lines.push(`• ${c.symbol}: de ${VERDICT_LABEL[c.from]} a ${VERDICT_LABEL[c.to]}`);
  }

  const next = nextSession(day);
  const upcoming: string[] = [];
  for (const e of events) {
    if (e.earnings && e.earnings.date > day && e.earnings.date <= next) {
      const when = e.earnings.hour === "bmo" ? " antes de la apertura" : e.earnings.hour === "amc" ? " después del cierre" : "";
      upcoming.push(`• ${e.symbol} presenta resultados el ${shortDate(e.earnings.date)}${when}`);
    }
    if (e.nextDividend) {
      const date = new Date(e.nextDividend.time * 1000).toISOString().slice(0, 10);
      if (date > day && date <= next) upcoming.push(`• ${e.symbol}: posible fecha ex-dividendo el ${shortDate(date)} (estimada)`);
    }
  }
  if (upcoming.length) lines.push("Próxima sesión:", ...upcoming);

  if (!lines.length) return null;
  lines.push("Es orientativo, no asesoría financiera.");
  return { title: `Resumen del día · ${shortDate(day)}`, body: lines.join("\n"), url: "/" };
}
