"use client";

import Link from "next/link";
import { RequireAuth } from "@/components/auth";
import { changeClass, formatPrice } from "@/components/format";
import { Header } from "@/components/header";
import { useOwnRows, useQuotes } from "@/components/hooks";
import { PositionForm } from "@/components/position-form";
import { summarizePortfolio, USDCOP, type CurrencyTotal, type Position } from "@/lib/portfolio";

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
  const summary = summarizePortfolio(
    (positions ?? []).map((p) => ({ ...p, quantity: Number(p.quantity), buy_price: Number(p.buy_price) })),
    quotes,
    quotes[USDCOP]?.price,
  );

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
            <TotalCard key={t.currency} title={`Posiciones en ${t.currency}`} total={t} />
          ))}
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
          {summary.totalCop && quotes[USDCOP] && ` Dólar a ${formatPrice(quotes[USDCOP]!.price)} COP.`}
        </p>
      )}
    </main>
  );
}

function TotalCard({ title, total }: { title: string; total: CurrencyTotal }) {
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
    </div>
  );
}
