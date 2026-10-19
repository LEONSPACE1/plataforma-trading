"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { RequireAuth } from "@/components/auth";
import { changeClass, formatPrice } from "@/components/format";
import { Header } from "@/components/header";
import { VERDICT_LABEL } from "@/lib/alerts/rules";
import type { Verdict } from "@/lib/analysis/signal";
import {
  filterScreener,
  NO_FILTERS,
  SCREENER_MARKET_LABEL,
  type ScreenerFilters,
  type ScreenerMarket,
  type ScreenerRow,
} from "@/lib/screener";
import { supabase } from "@/lib/supabase/client";

export default function ScreenerPage() {
  return (
    <RequireAuth>
      <Header />
      <Screener />
    </RequireAuth>
  );
}

type SortKey = "score" | "change_percent" | "rsi" | "pe" | "dividend_yield" | "symbol";

const PRESETS: { label: string; filters: Partial<ScreenerFilters>; sort: SortKey; asc?: boolean }[] = [
  { label: "Señal Comprar", filters: { verdict: "comprar" }, sort: "score" },
  { label: "Sobrevendidas (RSI < 30)", filters: { rsiMax: 30 }, sort: "rsi", asc: true },
  { label: "Sobrecompradas (RSI > 70)", filters: { rsiMin: 70 }, sort: "rsi" },
  { label: "Baratas con dividendo", filters: { peMax: 15, dividendMin: 3 }, sort: "dividend_yield" },
  { label: "Tendencia alcista", filters: { aboveSma200: true, goldenCross: true }, sort: "score" },
];

const input = "rounded-md border border-line bg-surface px-2 py-1.5 text-sm";
const numOrNull = (v: string) => (v.trim() === "" || Number.isNaN(Number(v)) ? null : Number(v));
const fmt = (v: number | null, digits = 1) => (v == null ? "—" : v.toLocaleString("es-CO", { maximumFractionDigits: digits }));

function Screener() {
  const [rows, setRows] = useState<ScreenerRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<ScreenerFilters>(NO_FILTERS);
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: "score", asc: false });

  useEffect(() => {
    supabase()
      .from("screener")
      .select("*")
      .then(({ data, error }) => {
        setError(error?.message ?? null);
        setRows((data ?? []) as ScreenerRow[]);
      });
  }, []);

  const set = <K extends keyof ScreenerFilters>(k: K, v: ScreenerFilters[K]) => setFilters((f) => ({ ...f, [k]: v }));
  const shown = filterScreener(rows ?? [], filters).sort((a, b) => {
    const dir = sort.asc ? 1 : -1;
    if (sort.key === "symbol") return dir * a.symbol.localeCompare(b.symbol);
    const [x, y] = [a[sort.key], b[sort.key]];
    if (x == null) return 1;
    if (y == null) return -1;
    return dir * (x - y);
  });
  const analyzed = (rows ?? []).filter((r) => r.verdict != null);
  const newest = analyzed.reduce<string | null>((m, r) => (r.updated_at && (!m || r.updated_at > m) ? r.updated_at : m), null);

  const header = (key: SortKey, label: string, className = "text-right") => (
    <th className={`cursor-pointer select-none py-2 font-medium ${className}`} onClick={() => setSort({ key, asc: sort.key === key ? !sort.asc : key === "symbol" })}>
      {label}
      {sort.key === key ? (sort.asc ? " ▲" : " ▼") : ""}
    </th>
  );

  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-16">
      <h1 className="pt-4 text-2xl font-bold">Screener</h1>
      <p className="pb-4 text-sm text-muted">
        Filtra unas 140 acciones y ETF de EE. UU. y Colombia, más las que tengas en tus listas, por su señal, indicadores y
        fundamentales.
      </p>

      <div className="flex flex-wrap gap-2 pb-3">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => {
              setFilters({ ...NO_FILTERS, market: filters.market, ...p.filters });
              setSort({ key: p.sort, asc: p.asc ?? false });
            }}
            className="rounded-full border border-line px-3 py-1.5 text-sm hover:bg-line"
          >
            {p.label}
          </button>
        ))}
        <button onClick={() => setFilters(NO_FILTERS)} className="px-2 text-sm text-muted hover:underline">
          Quitar filtros
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-line p-3">
        <label className="flex flex-col text-xs text-muted">
          Mercado
          <select value={filters.market} onChange={(e) => set("market", e.target.value as ScreenerMarket | "all")} className={input}>
            <option value="all">Todos</option>
            {(Object.keys(SCREENER_MARKET_LABEL) as ScreenerMarket[]).map((m) => (
              <option key={m} value={m}>
                {SCREENER_MARKET_LABEL[m]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col text-xs text-muted">
          Señal
          <select value={filters.verdict} onChange={(e) => set("verdict", e.target.value as Verdict | "all")} className={input}>
            <option value="all">Todas</option>
            {(Object.keys(VERDICT_LABEL) as Verdict[]).map((v) => (
              <option key={v} value={v}>
                {VERDICT_LABEL[v]}
              </option>
            ))}
          </select>
        </label>
        <NumberFilter label="RSI desde" value={filters.rsiMin} onChange={(v) => set("rsiMin", v)} />
        <NumberFilter label="RSI hasta" value={filters.rsiMax} onChange={(v) => set("rsiMax", v)} />
        <NumberFilter label="P/E máximo" value={filters.peMax} onChange={(v) => set("peMax", v)} />
        <NumberFilter label="Dividendo mín. %" value={filters.dividendMin} onChange={(v) => set("dividendMin", v)} />
        <label className="flex items-center gap-1.5 py-1.5 text-sm">
          <input type="checkbox" checked={filters.aboveSma200} onChange={(e) => set("aboveSma200", e.target.checked)} />
          Sobre su media 200
        </label>
        <label className="flex items-center gap-1.5 py-1.5 text-sm">
          <input type="checkbox" checked={filters.goldenCross} onChange={(e) => set("goldenCross", e.target.checked)} />
          Media 50 sobre la 200
        </label>
      </div>

      {error && <p className="pt-3 text-sm text-down">{error}</p>}
      {rows === null ? (
        <p className="pt-4 text-muted">Cargando…</p>
      ) : analyzed.length === 0 ? (
        <p className="pt-4 text-muted">
          El screener se está llenando: el servidor analiza unos 8 activos por minuto, así que en unos 20 minutos estará completo.
        </p>
      ) : (
        <>
          <p className="pt-3 text-sm text-muted">
            {shown.length} de {analyzed.length} activos
          </p>
          <div className="-mx-4 overflow-x-auto px-4">
            <table className="w-full min-w-[640px] text-sm tabular-nums">
              <thead className="border-b border-line text-xs text-muted">
                <tr>
                  {header("symbol", "Activo", "text-left")}
                  <th className="py-2 text-right font-medium">Precio</th>
                  {header("change_percent", "Día")}
                  {header("score", "Señal")}
                  {header("rsi", "RSI")}
                  {header("pe", "P/E")}
                  {header("dividend_yield", "Dividendo")}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {shown.map((r) => (
                  <tr key={r.symbol}>
                    <td className="max-w-[220px] py-2">
                      <Link href={`/activo/${encodeURIComponent(r.symbol)}`} className="font-semibold hover:underline">
                        {r.symbol}
                      </Link>
                      <div className="truncate text-xs text-muted">{r.name}</div>
                    </td>
                    <td className="text-right">{r.price == null ? "—" : formatPrice(r.price, r.currency ?? undefined)}</td>
                    <td className={`text-right ${changeClass(r.change_percent ?? 0)}`}>
                      {r.change_percent == null ? "—" : `${r.change_percent > 0 ? "+" : ""}${fmt(r.change_percent, 2)} %`}
                    </td>
                    <td className="text-right">
                      <span className={r.verdict === "comprar" ? "text-up" : r.verdict === "vender" ? "text-down" : "text-muted"}>
                        {r.verdict ? VERDICT_LABEL[r.verdict] : "—"}
                      </span>{" "}
                      <span className="text-xs text-muted">{r.score != null && `${r.score > 0 ? "+" : ""}${r.score}`}</span>
                    </td>
                    <td className="text-right">{fmt(r.rsi)}</td>
                    <td className="text-right">{fmt(r.pe)}</td>
                    <td className="text-right">{r.dividend_yield == null ? "—" : `${fmt(r.dividend_yield * 100)} %`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p className="mt-6 text-xs text-muted">
        Cada activo se analiza una vez al día con velas diarias de Yahoo Finance
        {newest && ` (último análisis ${new Date(newest).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })})`}
        , así que los precios de esta tabla no son en vivo. Las señales son orientativas y no constituyen asesoría financiera.
      </p>
    </main>
  );
}

function NumberFilter({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  const [text, setText] = useState(value == null ? "" : String(value));
  // Presets and "Quitar filtros" change the value from outside; keep what is being typed ("0,") otherwise.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setText((t) => (numOrNull(t.replace(",", ".")) === value ? t : value == null ? "" : String(value)));
  }, [value]);
  return (
    <label className="flex flex-col text-xs text-muted">
      {label}
      <input
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          onChange(numOrNull(e.target.value.replace(",", ".")));
        }}
        inputMode="decimal"
        className={`${input} w-24`}
      />
    </label>
  );
}
