"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { RequireAuth } from "@/components/auth";
import { changeClass, formatPrice } from "@/components/format";
import { Header } from "@/components/header";
import { useOwnRows, useQuotes } from "@/components/hooks";
import { PositionForm } from "@/components/position-form";
import type { Trm } from "@/lib/market/trm";
import {
  allocation,
  compareWithBenchmark,
  summarizePortfolio,
  USDCOP,
  type CurrencyComparison,
  type CurrencyTotal,
  type Position,
  type PositionExtras,
  type Slice,
} from "@/lib/portfolio";
import { apiFetch } from "@/lib/supabase/client";

export default function PortfolioPage() {
  return (
    <RequireAuth>
      <Header />
      <Portfolio />
    </RequireAuth>
  );
}

const signed = (n: number, currency?: string) => `${n > 0 ? "+" : ""}${formatPrice(n, currency)}`;
const pct = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(2)} %`;

function Portfolio() {
  const { rows: positions, error, mutate } = useOwnRows<Position>("positions", { column: "bought_on" });
  const symbols = [...new Set((positions ?? []).map((p) => p.symbol))];
  const { results, updatedAt } = useQuotes(symbols.length ? [...symbols, USDCOP] : []);
  const quotes = Object.fromEntries(Object.entries(results).map(([s, r]) => [s, r.quote]));
  const [rateSource, setRateSource] = useState<"live" | "trm">("live");
  const parsed = (positions ?? []).map((p) => ({ ...p, quantity: Number(p.quantity), buy_price: Number(p.buy_price) }));

  // Dividends, benchmark and TRM change at most daily: load once per set of purchases, after their currencies are known.
  const [extras, setExtras] = useState<{ key: string; extras: Record<string, PositionExtras>; trm: Trm | null } | null>(null);
  const extrasInput = parsed.map((p) => ({ id: p.id, symbol: p.symbol, quantity: p.quantity, bought_on: p.bought_on, currency: quotes[p.symbol]?.currency }));
  const extrasKey = extrasInput.every((p) => p.currency) ? JSON.stringify(extrasInput) : "";
  useEffect(() => {
    if (!extrasKey) return;
    let cancelled = false;
    apiFetch<{ extras: Record<string, PositionExtras>; trm: Trm | null }>("/api/portfolio-extras", { body: { positions: JSON.parse(extrasKey) } })
      .then((r) => !cancelled && setExtras({ key: extrasKey, ...r }))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [extrasKey]);
  const current = extras?.key === extrasKey ? extras : null;
  const trm = current?.trm ?? null;

  const usdCop = rateSource === "trm" && trm ? trm.value : quotes[USDCOP]?.price;
  const summary = summarizePortfolio(parsed, quotes, usdCop);
  const comparison = current ? compareWithBenchmark(summary.rows, current.extras) : [];
  const mix = allocation(summary.rows, usdCop);

  const remove = async (id: string, symbol: string) => {
    if (!confirm(`¿Eliminar esta compra de ${symbol}?`)) return;
    await mutate((db) => db.from("positions").delete().eq("id", id));
  };

  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-16">
      <h1 className="py-4 text-2xl font-bold">Portafolio</h1>
      {error && <p className="text-sm text-down">{error}</p>}

      {summary.totals.length > 0 && (
        <div className="grid gap-3 pb-6 sm:grid-cols-3">
          {summary.totalCop && summary.totals.length > 1 && <TotalCard title="Total en COP" total={summary.totalCop} />}
          {summary.totals.map((t) => (
            <TotalCard
              key={t.currency}
              title={`Posiciones en ${t.currency}`}
              total={t}
              comparison={comparison.find((c) => c.currency === t.currency)}
            />
          ))}
        </div>
      )}

      {summary.totalCop && summary.totals.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 pb-4 text-sm text-muted">
          Convertir dólares con
          {(["live", "trm"] as const).map((src) => (
            <button
              key={src}
              onClick={() => setRateSource(src)}
              disabled={src === "trm" && !trm}
              className={`rounded-full px-3 py-1 ${rateSource === src ? "bg-accent text-white" : "border border-line"}`}
            >
              {src === "live"
                ? `Dólar en vivo${quotes[USDCOP] ? ` (${formatPrice(quotes[USDCOP]!.price)})` : ""}`
                : `TRM oficial${trm ? ` (${formatPrice(trm.value)}, ${new Date(`${trm.validFrom}T12:00:00`).toLocaleDateString("es-CO")})` : ""}`}
            </button>
          ))}
        </div>
      )}

      {mix.byAsset.length > 1 && (
        <div className="grid gap-4 pb-6 sm:grid-cols-2">
          <Mix title="Por mercado" slices={mix.byMarket} />
          <Mix title="Por activo" slices={mix.byAsset.slice(0, 8)} />
        </div>
      )}

      {positions === null ? (
        <p className="text-muted">Cargando…</p>
      ) : positions.length === 0 ? (
        <p className="text-muted">Aún no registras compras. Agrega la primera abajo o desde la página de un activo.</p>
      ) : (
        <ul className="divide-y divide-line">
          {summary.rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3 py-3">
              <Link href={`/activo/${encodeURIComponent(r.symbol)}`} className="min-w-0 flex-1">
                <div className="font-semibold">{r.symbol}</div>
                <div className="text-sm text-muted">
                  {Number(r.quantity).toLocaleString("es-CO")} × {formatPrice(r.buy_price, r.currency)} ·{" "}
                  {new Date(`${r.bought_on}T12:00:00`).toLocaleDateString("es-CO")}
                </div>
                {r.note && <div className="truncate text-xs text-muted">{r.note}</div>}
              </Link>
              <div className="text-right tabular-nums">
                {r.value != null ? (
                  <>
                    <div>{formatPrice(r.value, r.currency)}</div>
                    <div className={`text-sm ${changeClass(r.pnl!)}`}>
                      {signed(r.pnl!)} ({pct(r.pnlPercent!)})
                    </div>
                    <div className={`text-xs ${changeClass(r.dayChange!)}`}>Hoy {signed(r.dayChange!)}</div>
                    {!!current?.extras[r.id]?.dividends && (
                      <div className="text-xs text-up">Dividendos {formatPrice(current.extras[r.id].dividends, r.currency)}</div>
                    )}
                  </>
                ) : results[r.symbol]?.error ? (
                  <div className="text-sm text-down">Sin precio</div>
                ) : (
                  <div className="text-sm text-muted">…</div>
                )}
              </div>
              <button onClick={() => remove(r.id, r.symbol)} title="Eliminar compra" className="px-2 text-muted hover:text-down">
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <section className="mt-8">
        <h2 className="pb-2 font-semibold">Registrar una compra</h2>
        <PositionForm />
        <p className="mt-2 text-xs text-muted">
          El precio de compra va en la moneda en que cotiza el activo (USD para EE. UU., COP para la Bolsa de Colombia).
        </p>
      </section>

      {updatedAt && (
        <p className="mt-6 text-xs text-muted">
          Precios actualizados {updatedAt.toLocaleTimeString("es-CO")}. Se refrescan cada 15 segundos.
          {summary.totalCop && usdCop && ` Dólar a ${formatPrice(usdCop)} COP (${rateSource === "trm" ? "TRM oficial" : "en vivo"}).`}
        </p>
      )}
      <p className="mt-2 text-xs text-muted">
        Los dividendos se calculan con los pagos que Yahoo Finance registra después de cada compra (hasta 5 años atrás), antes de
        impuestos. Las posiciones en pesos se comparan con el ETF del COLCAP (ICOLCAP) y las de dólares con el S&amp;P 500 (SPY),
        desde la fecha de cada compra.
      </p>
    </main>
  );
}

function TotalCard({ title, total, comparison }: { title: string; total: CurrencyTotal; comparison?: CurrencyComparison }) {
  return (
    <div className="rounded-lg border border-line p-3 tabular-nums">
      <div className="text-xs text-muted">{title}</div>
      <div className="text-xl font-semibold">{formatPrice(total.value, total.currency)}</div>
      <div className={`text-sm ${changeClass(total.pnl)}`}>
        {signed(total.pnl)} ({pct(total.pnlPercent)})
      </div>
      <div className="text-xs text-muted">
        Invertido {formatPrice(total.cost, total.currency)} · <span className={changeClass(total.dayChange)}>Hoy {signed(total.dayChange)}</span>
      </div>
      {comparison && comparison.dividends > 0 && (
        <div className="text-xs text-muted">Dividendos cobrados {formatPrice(comparison.dividends, total.currency)}</div>
      )}
      {comparison?.ownReturn != null && comparison.benchmarkReturn != null && (
        <div className="text-xs text-muted">
          Con dividendos <span className={changeClass(comparison.ownReturn)}>{pct(comparison.ownReturn * 100)}</span> vs{" "}
          {comparison.benchmark === "SPY" ? "S&P 500" : "COLCAP"}{" "}
          <span className={changeClass(comparison.benchmarkReturn)}>{pct(comparison.benchmarkReturn * 100)}</span>
        </div>
      )}
    </div>
  );
}

function Mix({ title, slices }: { title: string; slices: Slice[] }) {
  return (
    <div className="rounded-lg border border-line p-3">
      <div className="pb-2 text-xs text-muted">{title} (valor en COP)</div>
      <ul className="space-y-1.5">
        {slices.map((s) => (
          <li key={s.key} className="text-sm">
            <div className="flex justify-between tabular-nums">
              <span>{s.label}</span>
              <span className="text-muted">{(s.share * 100).toFixed(1)} %</span>
            </div>
            <div className="h-1.5 rounded-full bg-line">
              <div className="h-1.5 rounded-full bg-accent" style={{ width: `${s.share * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
