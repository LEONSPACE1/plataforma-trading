import { verdictFor, type Analysis, type Verdict } from "../analysis/signal";
import type { Quote } from "../market/types";

// Decides whether an alert fires. Kept free of I/O so it can be unit tested;
// the runner in ./run.ts fetches the data and sends the notifications.

export type AlertKind = "price_above" | "price_below" | "signal_change" | "technical_change";

export type Alert = {
  id: string;
  user_id: string;
  symbol: string;
  kind: AlertKind;
  target: number | null;
  active: boolean;
  last_verdict: Verdict | null;
  last_checked_at: string | null;
  last_triggered_at: string | null;
  created_at: string;
};

export const ALERT_KINDS: { value: AlertKind; label: string }[] = [
  { value: "price_above", label: "Precio sube a" },
  { value: "price_below", label: "Precio baja a" },
  { value: "signal_change", label: "Cambia la señal general" },
  { value: "technical_change", label: "Cambia la señal técnica" },
];

export const isPriceAlert = (kind: AlertKind) => kind === "price_above" || kind === "price_below";

/** Signals move with daily candles, so re-checking them every hour is plenty and spares the data sources. */
export const SIGNAL_CHECK_MINUTES = 60;

export const VERDICT_LABEL: Record<Verdict, string> = { comprar: "Comprar", mantener: "Mantener", vender: "Vender" };

export type Notification = { title: string; body: string; url: string };

const fmt = (n: number) => n.toLocaleString("es-CO", { maximumFractionDigits: n < 10 ? 4 : 2 });

export function describeAlert(a: Pick<Alert, "kind" | "target" | "symbol">): string {
  switch (a.kind) {
    case "price_above":
      return `${a.symbol} sube a ${fmt(a.target!)} o más`;
    case "price_below":
      return `${a.symbol} baja a ${fmt(a.target!)} o menos`;
    case "signal_change":
      return `Cambia la señal general de ${a.symbol}`;
    case "technical_change":
      return `Cambia la señal técnica de ${a.symbol}`;
  }
}

/** A price alert fires once, when the price reaches the target. */
export function checkPriceAlert(alert: Alert, quote: Quote): Notification | null {
  const hit = alert.kind === "price_above" ? quote.price >= alert.target! : quote.price <= alert.target!;
  if (!hit) return null;
  const price = `${fmt(quote.price)}${quote.currency ? ` ${quote.currency}` : ""}`;
  return {
    title: `${alert.symbol} ${alert.kind === "price_above" ? "subió" : "bajó"} a ${price}`,
    body: `Tu alerta: ${describeAlert(alert)}. ${quote.name ?? ""}`.trim(),
    url: `/activo/${encodeURIComponent(alert.symbol)}`,
  };
}

export function signalCheckDue(alert: Alert, now: Date): boolean {
  if (!alert.last_checked_at) return true;
  return now.getTime() - new Date(alert.last_checked_at).getTime() >= SIGNAL_CHECK_MINUTES * 60_000;
}

/**
 * A signal alert remembers the last verdict it saw. The first check only sets
 * that baseline; later checks notify when the verdict changes.
 */
export function checkSignalAlert(
  alert: Alert,
  analysis: Analysis,
): { verdict: Verdict; notification: Notification | null } {
  const technical = alert.kind === "technical_change";
  const verdict = technical ? verdictFor(analysis.technicalScore) : analysis.verdict;
  if (!alert.last_verdict || alert.last_verdict === verdict) return { verdict, notification: null };

  const score = technical ? analysis.technicalScore : analysis.score;
  const what = technical ? "señal técnica" : "señal";
  return {
    verdict,
    notification: {
      title: `${alert.symbol}: la ${what} pasó de ${VERDICT_LABEL[alert.last_verdict]} a ${VERDICT_LABEL[verdict]}`,
      body: `Puntaje ${score > 0 ? "+" : ""}${score}. ${analysis.summary} Es orientativo, no asesoría financiera.`,
      url: `/activo/${encodeURIComponent(alert.symbol)}`,
    },
  };
}
