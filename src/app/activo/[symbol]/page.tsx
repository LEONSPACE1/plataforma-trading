"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { RequireAuth } from "@/components/auth";
import { changeClass, formatChange, formatPrice } from "@/components/format";
import { Header } from "@/components/header";
import { useQuotes, useWatchlists } from "@/components/hooks";
import { AnalysisPanel } from "@/components/analysis-panel";
import { PriceChart, STUDIES, type Study } from "@/components/price-chart";
import { catalogName } from "@/lib/market/catalog";
import type { Candle, ChartRange } from "@/lib/market/types";
import { apiFetch } from "@/lib/supabase/client";

const RANGES: { value: ChartRange; label: string }[] = [
  { value: "1d", label: "1D" },
  { value: "5d", label: "5D" },
  { value: "1mo", label: "1M" },
  { value: "6mo", label: "6M" },
  { value: "1y", label: "1A" },
  { value: "5y", label: "5A" },
];

export default function AssetPage() {
  return (
    <RequireAuth>
      <Header />
      <Asset />
    </RequireAuth>
  );
}

function Asset() {
  const params = useParams<{ symbol: string }>();
  const symbol = decodeURIComponent(params.symbol).toUpperCase();
  // One year by default so the 200-day average fits on the chart.
  const [range, setRange] = useState<ChartRange>("1y");
  const [studies, setStudies] = useState<Study[]>(["medias"]);
  const [candles, setCandles] = useState<{ key: string; data?: Candle[]; error?: string } | null>(null);
  const { results } = useQuotes([symbol]);
  const quote = results[symbol]?.quote;
  const { lists, addSymbol, removeSymbol } = useWatchlists();

  const chartKey = `${symbol}:${range}`;
  useEffect(() => {
    let cancelled = false;
    apiFetch<{ candles: Candle[] }>(`/api/candles?symbol=${encodeURIComponent(symbol)}&range=${range}`)
      .then((r) => !cancelled && setCandles({ key: chartKey, data: r.candles }))
      .catch((e) => !cancelled && setCandles({ key: chartKey, error: e.message }));
    return () => {
      cancelled = true;
    };
  }, [symbol, range, chartKey]);
  const current = candles?.key === chartKey ? candles : null;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-16">
      <div className="flex flex-wrap items-end justify-between gap-3 py-4">
        <div>
          <h1 className="text-2xl font-bold">{symbol}</h1>
          <p className="text-muted">{quote?.name ?? catalogName(symbol) ?? ""}</p>
        </div>
        {quote && (
          <div className="text-right tabular-nums">
            <div className="text-2xl font-semibold">{formatPrice(quote.price, quote.currency)}</div>
            <div className={changeClass(quote.change)}>{formatChange(quote.change, quote.changePercent)}</div>
            <div className="text-xs text-muted">
              {quote.delayMinutes > 0 ? `Retraso de ${quote.delayMinutes} min` : "Tiempo real"} ·{" "}
              {quote.source === "finnhub" ? "Finnhub" : "Yahoo Finance"}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1 pb-3">
        {RANGES.map((r) => (
          <button
            key={r.value}
            onClick={() => setRange(r.value)}
            className={`rounded-md px-3 py-1 text-sm ${range === r.value ? "bg-accent text-white" : "border border-line"}`}
          >
            {r.label}
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-line" />
        {STUDIES.map((s) => {
          const on = studies.includes(s.value);
          return (
            <button
              key={s.value}
              onClick={() => setStudies(on ? studies.filter((x) => x !== s.value) : [...studies, s.value])}
              className={`rounded-md px-3 py-1 text-sm ${on ? "bg-foreground text-background" : "border border-line"}`}
            >
              {s.label}
            </button>
          );
        })}
      </div>

      {current?.data ? (
        current.data.length ? (
          <PriceChart candles={current.data} studies={studies} />
        ) : (
          <p className="py-10 text-muted">No hay velas para este rango.</p>
        )
      ) : current?.error ? (
        <p className="py-10 text-down">No se pudo cargar el gráfico: {current.error}</p>
      ) : (
        <p className="py-10 text-muted">Cargando gráfico…</p>
      )}

      <AnalysisPanel symbol={symbol} />

      {lists && lists.length > 0 && (
        <section className="mt-6">
          <h2 className="pb-2 font-semibold">Listas de seguimiento</h2>
          <div className="flex flex-wrap gap-2">
            {lists.map((l) => {
              const has = l.symbols.includes(symbol);
              return (
                <button
                  key={l.id}
                  onClick={() => (has ? removeSymbol(l.id, symbol) : addSymbol(l.id, symbol))}
                  className={`rounded-full px-3 py-1.5 text-sm ${has ? "bg-accent text-white" : "border border-line"}`}
                >
                  {has ? "★" : "☆"} {l.name}
                </button>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}
