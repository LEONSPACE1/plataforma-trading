import { verdictFor, type Analysis, type TechnicalSnapshot, type Verdict } from "../analysis/signal";
import type { Quote } from "../market/types";

// Decides whether an alert fires. Kept free of I/O so it can be unit tested;
// the runner in ./run.ts fetches the data and sends the notifications.

export type AlertKind =
  | "price_above"
  | "price_below"
  | "signal_change"
  | "technical_change"
  | "rsi_above"
  | "rsi_below"
  | "ma_cross"
  | "macd_cross";

/** Which side of its threshold an indicator sat on at the last check. */
export type Side = "arriba" | "abajo";

export type Alert = {
  id: string;
  user_id: string;
  symbol: string;
  kind: AlertKind;
  target: number | null;
  active: boolean;
  last_verdict: Verdict | null;
  last_state: Side | null;
  last_checked_at: string | null;
  last_triggered_at: string | null;
  created_at: string;
};

export const ALERT_KINDS: { value: AlertKind; label: string }[] = [
  { value: "price_above", label: "Precio sube a" },
  { value: "price_below", label: "Precio baja a" },
  { value: "signal_change", label: "Cambia la señal general" },
  { value: "technical_change", label: "Cambia la señal técnica" },
  { value: "rsi_above", label: "RSI (14) sube por encima de" },
  { value: "rsi_below", label: "RSI (14) baja por debajo de" },
  { value: "ma_cross", label: "Cruzan las medias 50 y 200" },
  { value: "macd_cross", label: "El MACD cruza su señal" },
];

export const isPriceAlert = (kind: AlertKind) => kind === "price_above" || kind === "price_below";
export const isRsiAlert = (kind: AlertKind) => kind === "rsi_above" || kind === "rsi_below";
export const isIndicatorAlert = (kind: AlertKind) => isRsiAlert(kind) || kind === "ma_cross" || kind === "macd_cross";
/** Kinds that need a number: a price, or an RSI level. */
export const needsTarget = (kind: AlertKind) => isPriceAlert(kind) || isRsiAlert(kind);

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
    case "rsi_above":
      return `El RSI de ${a.symbol} sube por encima de ${fmt(a.target!)}`;
    case "rsi_below":
      return `El RSI de ${a.symbol} baja por debajo de ${fmt(a.target!)}`;
    case "ma_cross":
      return `La media de 50 de ${a.symbol} cruza la de 200`;
    case "macd_cross":
      return `El MACD de ${a.symbol} cruza su línea de señal`;
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

/** The indicator's side for this alert, or null when there isn't enough history to compute it. */
export function indicatorSide(alert: Pick<Alert, "kind" | "target">, t: TechnicalSnapshot): Side | null {
  switch (alert.kind) {
    case "rsi_above":
    case "rsi_below":
      return t.rsi14 == null ? null : t.rsi14 > alert.target! ? "arriba" : "abajo";
    case "ma_cross":
      return t.sma50 == null || t.sma200 == null ? null : t.sma50 > t.sma200 ? "arriba" : "abajo";
    case "macd_cross":
      return t.macd == null || t.macdSignal == null ? null : t.macd > t.macdSignal ? "arriba" : "abajo";
    default:
      return null;
  }
}

/**
 * Indicator alerts fire on the cross, not while the indicator stays past the
 * line: the first check only records the side, later checks notify when it
 * changes in the direction the alert asks for (either way for crossovers).
 */
export function checkIndicatorAlert(alert: Alert, analysis: Analysis): { state: Side | null; notification: Notification | null } {
  const t = analysis.technical;
  const state = indicatorSide(alert, t);
  if (!state || !alert.last_state || state === alert.last_state) return { state, notification: null };

  const url = `/activo/${encodeURIComponent(alert.symbol)}`;
  const tail = " Es orientativo, no asesoría financiera.";
  switch (alert.kind) {
    case "rsi_above":
    case "rsi_below": {
      const wanted = alert.kind === "rsi_above" ? "arriba" : "abajo";
      if (state !== wanted) return { state, notification: null };
      const zone = t.rsi14! >= 70 ? " Zona de sobrecompra." : t.rsi14! <= 30 ? " Zona de sobreventa." : "";
      return {
        state,
        notification: {
          title: `${alert.symbol}: RSI en ${fmt(t.rsi14!)}, ${wanted === "arriba" ? "por encima" : "por debajo"} de ${fmt(alert.target!)}`,
          body: `Tu alerta: ${describeAlert(alert)}.${zone}${tail}`,
          url,
        },
      };
    }
    case "ma_cross":
      return {
        state,
        notification: {
          title:
            state === "arriba"
              ? `${alert.symbol}: cruce dorado (media 50 sobre la 200)`
              : `${alert.symbol}: cruce de la muerte (media 50 bajo la 200)`,
          body: `Media 50 en ${fmt(t.sma50!)} y media 200 en ${fmt(t.sma200!)}. Suele marcar un cambio de tendencia de fondo.${tail}`,
          url,
        },
      };
    case "macd_cross":
      return {
        state,
        notification: {
          title: `${alert.symbol}: el MACD cruzó su señal hacia ${state}`,
          body: `MACD ${fmt(t.macd!)} y señal ${fmt(t.macdSignal!)}: impulso ${state === "arriba" ? "alcista" : "bajista"}.${tail}`,
          url,
        },
      };
    default:
      return { state, notification: null };
  }
}
