"use client";

import { RequireAuth } from "@/components/auth";
import { EventRow, upcomingEvents, useCalendar } from "@/components/events-list";
import { Header } from "@/components/header";
import { useOwnRows, useWatchlists } from "@/components/hooks";
import type { Position } from "@/lib/portfolio";

export default function CalendarPage() {
  return (
    <RequireAuth>
      <Header />
      <Calendar />
    </RequireAuth>
  );
}

function Calendar() {
  const { lists } = useWatchlists();
  const { rows: positions } = useOwnRows<Position>("positions");
  const ready = lists !== null && positions !== null;
  const symbols = ready
    ? [...new Set([...(positions ?? []).map((p) => p.symbol), ...(lists ?? []).flatMap((l) => l.symbols)])]
        .filter((s) => !/[\^=]|-Y\./.test(s))
        .slice(0, 60)
    : [];
  const { data, error, loading } = useCalendar(symbols);
  const events = data ? upcomingEvents(data.results) : [];
  const failed = data?.results.filter((r) => r.error) ?? [];

  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-16">
      <h1 className="pt-4 text-2xl font-bold">Calendario</h1>
      <p className="pb-4 text-sm text-muted">
        Resultados y dividendos de los próximos 90 días de los activos de tu portafolio y tus listas.
      </p>

      {!ready || loading ? (
        <p className="text-muted">Cargando fechas…</p>
      ) : error ? (
        <p className="text-down">{error}</p>
      ) : symbols.length === 0 ? (
        <p className="text-muted">Agrega acciones a tus listas o a tu portafolio para ver sus fechas aquí.</p>
      ) : events.length === 0 ? (
        <p className="text-muted">No hay fechas conocidas en los próximos 90 días para tus {symbols.length} activos.</p>
      ) : (
        <ul className="divide-y divide-line">
          {events.map((e) => (
            <EventRow key={`${e.symbol}-${e.kind}`} e={e} />
          ))}
        </ul>
      )}
      {failed.length > 0 && <p className="pt-3 text-xs text-down">Sin datos para: {failed.map((r) => r.symbol).join(", ")}.</p>}

      <p className="mt-6 text-xs text-muted">
        Las fechas de resultados vienen de Finnhub y solo existen para empresas de EE. UU. Para acciones de Colombia y para todos
        los dividendos, la fecha se estima con la frecuencia de los pagos pasados (Yahoo Finance); confírmala con la empresa o tu
        comisionista. El resumen diario de Telegram te avisa la tarde anterior.
      </p>
    </main>
  );
}
