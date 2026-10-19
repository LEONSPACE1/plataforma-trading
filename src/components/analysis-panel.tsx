"use client";

import { useEffect, useState } from "react";
import type { Analysis, Factor, Verdict } from "@/lib/analysis/signal";
import { apiFetch } from "@/lib/supabase/client";
import { formatPrice } from "./format";

const VERDICT: Record<Verdict, { label: string; className: string }> = {
  comprar: { label: "Comprar", className: "bg-up text-white" },
  mantener: { label: "Mantener", className: "bg-muted text-white" },
  vender: { label: "Vender", className: "bg-down text-white" },
};

const VOTE = {
  1: { icon: "▲", className: "text-up", label: "A favor" },
  0: { icon: "●", className: "text-muted", label: "Neutral" },
  [-1]: { icon: "▼", className: "text-down", label: "En contra" },
} as const;

const fmt = (v: number | null, digits = 2) =>
  v == null ? "—" : v.toLocaleString("es-CO", { maximumFractionDigits: digits });
const pct = (v: number | null) => (v == null ? "—" : `${fmt(v * 100, 1)} %`);

/** Loads /api/analysis for the symbol and shows the explained signal. */
export function AnalysisPanel({ symbol }: { symbol: string }) {
  const [state, setState] = useState<{ symbol: string; data?: Analysis; error?: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch<{ analysis: Analysis }>(`/api/analysis?symbol=${encodeURIComponent(symbol)}`)
      .then((r) => !cancelled && setState({ symbol, data: r.analysis }))
      .catch((e) => !cancelled && setState({ symbol, error: e.message }));
    return () => {
      cancelled = true;
    };
  }, [symbol]);
  const current = state?.symbol === symbol ? state : null;

  return (
    <section className="mt-8">
      <h2 className="pb-2 text-lg font-semibold">Análisis y señal</h2>
      {current?.data ? (
        <AnalysisBody a={current.data} />
      ) : current?.error ? (
        <p className="py-4 text-down">No se pudo calcular el análisis: {current.error}</p>
      ) : (
        <p className="py-4 text-muted">Calculando indicadores…</p>
      )}
      <p className="mt-4 rounded-md border border-line p-3 text-xs text-muted">
        Señal orientativa generada automáticamente a partir de indicadores técnicos y datos públicos de los estados
        financieros. No es una recomendación de inversión ni asesoría financiera; los datos pueden tener retraso o
        errores. Decide con tu propio criterio.
      </p>
    </section>
  );
}

export function AnalysisBody({ a }: { a: Analysis }) {
  const v = VERDICT[a.verdict];
  const technical = a.factors.filter((f) => f.group === "tecnico");
  const fundamental = a.factors.filter((f) => f.group === "fundamental");
  const t = a.technical;
  const f = a.fundamentals;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-line p-4">
        <span className={`rounded-md px-4 py-2 text-xl font-bold uppercase ${v.className}`}>{v.label}</span>
        <div className="min-w-0 flex-1">
          <ScoreBar score={a.score} />
          <p className="pt-2 text-sm">{a.summary}</p>
          <p className="pt-1 text-xs text-muted">
            Puntaje {a.score > 0 ? "+" : ""}
            {a.score} (de −100 a +100) · técnico {a.technicalScore}
            {a.fundamentalScore != null && ` · fundamental ${a.fundamentalScore}`} · velas diarias hasta el{" "}
            {new Date(a.asOf * 1000).toLocaleDateString("es-CO")}
          </p>
        </div>
      </div>

      <FactorList title="Análisis técnico" factors={technical} />
      {fundamental.length > 0 && <FactorList title="Análisis fundamental" factors={fundamental} />}
      {a.notes.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          {a.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Table
          title="Indicadores técnicos"
          rows={[
            ["Media 20", t.sma20 == null ? "—" : formatPrice(t.sma20)],
            ["Media 50", t.sma50 == null ? "—" : formatPrice(t.sma50)],
            ["Media 200", t.sma200 == null ? "—" : formatPrice(t.sma200)],
            ["RSI (14)", fmt(t.rsi14, 1)],
            ["MACD / señal", `${fmt(t.macd)} / ${fmt(t.macdSignal)}`],
            ["Bollinger inf. / sup.", `${t.bollingerLower == null ? "—" : formatPrice(t.bollingerLower)} / ${t.bollingerUpper == null ? "—" : formatPrice(t.bollingerUpper)}`],
            ["Volumen 5d vs 50d", t.volumeRatio == null ? "Sin datos" : `${fmt(t.volumeRatio)}×`],
          ]}
        />
        {f && (
          <Table
            title={`Fundamentales${f.asOf ? ` (reporte al ${f.asOf})` : ""}`}
            rows={[
              ["P/E", fmt(f.pe, 1)],
              ["Margen bruto", pct(f.grossMargin)],
              ["Margen operativo", pct(f.operatingMargin)],
              ["Margen neto", pct(f.netMargin)],
              ["Deuda / patrimonio", fmt(f.debtToEquity)],
              ["Dividendo (12 meses)", pct(f.dividendYield)],
            ]}
          />
        )}
      </div>
    </div>
  );
}

function ScoreBar({ score }: { score: number }) {
  // Maps -100..100 onto 0..100 % of the bar width.
  const pos = (score + 100) / 2;
  return (
    <div className="relative h-2 rounded-full bg-gradient-to-r from-down via-line to-up" aria-label={`Puntaje ${score}`}>
      <span
        className="absolute top-1/2 h-4 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded bg-foreground"
        style={{ left: `${pos}%` }}
      />
    </div>
  );
}

function FactorList({ title, factors }: { title: string; factors: Factor[] }) {
  return (
    <div>
      <h3 className="pb-2 font-semibold">{title}</h3>
      <ul className="divide-y divide-line rounded-lg border border-line">
        {factors.map((f) => {
          const v = VOTE[f.vote];
          return (
            <li key={f.name} className="flex gap-3 p-3">
              <span className={`pt-0.5 ${v.className}`} title={v.label} aria-label={v.label}>
                {v.icon}
              </span>
              <div>
                <div className="text-sm font-medium">{f.name}</div>
                <div className="text-sm text-muted">{f.detail}</div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Table({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <div>
      <h3 className="pb-2 font-semibold">{title}</h3>
      <table className="w-full text-sm">
        <tbody className="divide-y divide-line">
          {rows.map(([k, v]) => (
            <tr key={k}>
              <td className="py-1.5 text-muted">{k}</td>
              <td className="py-1.5 text-right tabular-nums">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
