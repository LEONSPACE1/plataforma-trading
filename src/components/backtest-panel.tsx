"use client";

import { ColorType, createChart, LineSeries, type UTCTimestamp } from "lightweight-charts";
import { useEffect, useRef, useState } from "react";
import type { Backtest, EquityPoint } from "@/lib/analysis/backtest";
import { changeClass } from "./format";
import { useApi } from "./use-api";

const pct = (v: number) => `${v > 0 ? "+" : ""}${(v * 100).toLocaleString("es-CO", { maximumFractionDigits: 1 })} %`;
const date = (unix: number) => new Date(unix * 1000).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });

/** "Does the signal work?": replays the technical signal over five years, on demand. */
export function BacktestPanel({ symbol }: { symbol: string }) {
  const [asked, setAsked] = useState<string | null>(null);
  const path = asked === symbol ? `/api/backtest?symbol=${encodeURIComponent(symbol)}` : null;
  const { data, error, loading } = useApi<{ backtest: Backtest }>(path);
  const b = data?.backtest;

  return (
    <section className="mt-8">
      <h2 className="pb-2 text-lg font-semibold">¿Funciona la señal? (prueba histórica)</h2>
      {!path ? (
        <div>
          <p className="pb-2 text-sm text-muted">
            Simula qué habría pasado en los últimos 5 años comprando cuando la señal técnica pasaba a Comprar y vendiendo cuando
            pasaba a Vender, frente a comprar y mantener.
          </p>
          <button onClick={() => setAsked(symbol)} className="rounded-md bg-accent px-3 py-1.5 text-sm text-white">
            Probar la señal
          </button>
        </div>
      ) : loading ? (
        <p className="text-muted">Simulando…</p>
      ) : error ? (
        <p className="text-down">No se pudo hacer la prueba: {error}</p>
      ) : b ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Card title="Siguiendo la señal" value={b.strategyReturn} drawdown={b.strategyMaxDrawdown} accent />
            <Card title="Comprar y mantener" value={b.buyHoldReturn} drawdown={b.buyHoldMaxDrawdown} />
          </div>
          <EquityChart equity={b.equity} />
          <p className="text-sm text-muted">
            Del {date(b.from)} al {date(b.to)}: {b.trades.length} compra{b.trades.length === 1 ? "" : "s"}
            {b.winRate != null && `, ${Math.round(b.winRate * 100)} % de las operaciones cerradas con ganancia`}, con dinero
            invertido el {Math.round(b.exposure * 100)} % del tiempo.{" "}
            {b.strategyReturn > b.buyHoldReturn
              ? "La señal le ganó a comprar y mantener en este periodo."
              : "En este periodo, comprar y mantener rindió más que seguir la señal."}
          </p>
          {b.trades.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted">Ver operaciones</summary>
              <table className="mt-2 w-full tabular-nums">
                <thead className="text-left text-xs text-muted">
                  <tr>
                    <th className="py-1">Compra</th>
                    <th>Venta</th>
                    <th className="text-right">Resultado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {[...b.trades].reverse().map((t) => (
                    <tr key={t.entryTime}>
                      <td className="py-1">{date(t.entryTime)}</td>
                      <td>{t.exitTime ? date(t.exitTime) : "Abierta"}</td>
                      <td className={`text-right ${changeClass(t.return)}`}>{pct(t.return)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
          <p className="text-xs text-muted">
            Solo usa la parte técnica de la señal (no hay estados financieros históricos gratuitos), compra y vende a la apertura
            del día siguiente a la señal y no descuenta comisiones ni impuestos. Rentabilidades pasadas no garantizan resultados
            futuros.
          </p>
        </div>
      ) : null}
    </section>
  );
}

function Card({ title, value, drawdown, accent }: { title: string; value: number; drawdown: number; accent?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 tabular-nums ${accent ? "border-accent" : "border-line"}`}>
      <div className="text-xs text-muted">{title}</div>
      <div className={`text-xl font-semibold ${changeClass(value)}`}>{pct(value)}</div>
      <div className="text-xs text-muted">Peor caída desde un máximo: {pct(drawdown)}</div>
    </div>
  );
}

function EquityChart({ equity }: { equity: EquityPoint[] }) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    const styles = getComputedStyle(document.documentElement);
    const text = styles.getPropertyValue("--muted").trim() || "#888";
    const grid = styles.getPropertyValue("--line").trim() || "#8883";
    const accent = styles.getPropertyValue("--accent").trim() || "#2563eb";
    const chart = createChart(el, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "transparent" }, textColor: text },
      grid: { vertLines: { color: grid }, horzLines: { color: grid } },
    });
    const line = (key: "strategy" | "buyHold", color: string, title: string) =>
      chart
        .addSeries(LineSeries, { color, lineWidth: 2, title, priceLineVisible: false })
        .setData(equity.map((e) => ({ time: e.time as UTCTimestamp, value: e[key] })));
    line("buyHold", text, "Comprar y mantener");
    line("strategy", accent, "Señal");
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [equity]);
  return <div ref={container} className="h-[260px] w-full" aria-label="Valor de 100 invertidos con cada estrategia" />;
}
