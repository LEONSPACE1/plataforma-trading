"use client";

import Link from "next/link";
import type { AssetEvents } from "@/lib/market/events";
import { formatPrice } from "./format";
import { useApi } from "./use-api";

type Result = { symbol: string; events?: AssetEvents; error?: string };

export type CalendarEvent = {
  symbol: string;
  name?: string;
  /** YYYY-MM-DD. */
  date: string;
  kind: "resultados" | "dividendo";
  detail: string;
  estimated: boolean;
};

const HOUR: Record<string, string> = { bmo: "antes de la apertura", amc: "después del cierre", dmh: "durante la sesión" };
const day = (unix: number) => new Date(unix * 1000).toISOString().slice(0, 10);
export const longDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

/** Upcoming earnings and estimated dividends, oldest first. */
export function upcomingEvents(results: Result[]): CalendarEvent[] {
  const today = new Date().toISOString().slice(0, 10);
  const out: CalendarEvent[] = [];
  for (const { events: e } of results) {
    if (!e) continue;
    if (e.earnings) {
      const est = e.earnings.epsEstimate != null ? ` · utilidad por acción esperada ${formatPrice(e.earnings.epsEstimate)}` : "";
      out.push({
        symbol: e.symbol,
        name: e.name,
        date: e.earnings.date,
        kind: "resultados",
        detail: `Presenta resultados${e.earnings.hour && HOUR[e.earnings.hour] ? ` ${HOUR[e.earnings.hour]}` : ""}${est}`,
        estimated: false,
      });
    }
    if (e.nextDividend && day(e.nextDividend.time) >= today) {
      out.push({
        symbol: e.symbol,
        name: e.name,
        date: day(e.nextDividend.time),
        kind: "dividendo",
        detail: `Posible fecha ex-dividendo, cerca de ${formatPrice(e.nextDividend.amount, e.currency)} por acción (paga cada ~${e.nextDividend.everyDays} días)`,
        estimated: true,
      });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

export function useCalendar(symbols: string[]) {
  const key = symbols.join(",");
  return useApi<{ results: Result[] }>(key ? `/api/calendar?symbols=${encodeURIComponent(key)}` : null);
}

export function EventRow({ e, showSymbol = true }: { e: CalendarEvent; showSymbol?: boolean }) {
  return (
    <li className="flex gap-3 py-2.5">
      <span className={`mt-0.5 h-fit shrink-0 rounded px-2 py-0.5 text-xs text-white ${e.kind === "resultados" ? "bg-accent" : "bg-up"}`}>
        {e.kind === "resultados" ? "Resultados" : "Dividendo"}
      </span>
      <div className="min-w-0">
        <div className="text-sm font-medium">
          {longDate(e.date)}
          {showSymbol && (
            <>
              {" · "}
              <Link href={`/activo/${encodeURIComponent(e.symbol)}`} className="hover:underline">
                {e.symbol}
              </Link>
              {e.name && <span className="font-normal text-muted"> {e.name}</span>}
            </>
          )}
        </div>
        <div className="text-sm text-muted">
          {e.detail}
          {e.estimated && " (estimado)"}
        </div>
      </div>
    </li>
  );
}

/** Next events of one asset, for its page. */
export function AssetEventsPanel({ symbol }: { symbol: string }) {
  const { data, error, loading } = useCalendar([symbol]);
  const e = data?.results[0]?.events;
  const events = data ? upcomingEvents(data.results) : [];

  return (
    <section className="mt-8">
      <h2 className="pb-2 text-lg font-semibold">Próximos eventos</h2>
      {loading ? (
        <p className="text-muted">Buscando fechas…</p>
      ) : error || data?.results[0]?.error ? (
        <p className="text-down">No se pudieron cargar las fechas: {error ?? data?.results[0]?.error}</p>
      ) : (
        <>
          {events.length ? (
            <ul className="divide-y divide-line">
              {events.map((ev) => (
                <EventRow key={ev.kind} e={ev} showSymbol={false} />
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Sin fechas conocidas en los próximos 90 días.</p>
          )}
          {e?.lastDividend && (
            <p className="pt-2 text-sm text-muted">
              Último dividendo: {formatPrice(e.lastDividend.amount, e.currency)} por acción, ex-dividendo el{" "}
              {new Date(e.lastDividend.time * 1000).toLocaleDateString("es-CO")}
              {e.dividendYield != null && ` · rentabilidad por dividendo de 12 meses ${(e.dividendYield * 100).toFixed(1)} %`}.
            </p>
          )}
          <p className="pt-2 text-xs text-muted">
            Las fechas de resultados son de Finnhub y solo existen para empresas de EE. UU. La próxima fecha de dividendo se estima
            con la frecuencia de los pagos pasados; confírmala con la empresa o tu comisionista.
          </p>
        </>
      )}
    </section>
  );
}
