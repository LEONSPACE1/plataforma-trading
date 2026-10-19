"use client";

import Link from "next/link";
import { AlertForm } from "@/components/alert-form";
import { RequireAuth } from "@/components/auth";
import { Header } from "@/components/header";
import { useOwnRows } from "@/components/hooks";
import { NotificationSettings } from "@/components/notification-settings";
import { describeAlert, isIndicatorAlert, isPriceAlert, VERDICT_LABEL, type Alert } from "@/lib/alerts/rules";

type AlertEvent = { id: string; symbol: string; title: string; body: string; created_at: string };

export default function AlertsPage() {
  return (
    <RequireAuth>
      <Header />
      <Alerts />
    </RequireAuth>
  );
}

const when = (iso: string) =>
  new Date(iso).toLocaleString("es-CO", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

function Alerts() {
  const alerts = useOwnRows<Alert>("alerts");
  const events = useOwnRows<AlertEvent>("alert_events", { column: "created_at", ascending: false });

  return (
    <main className="mx-auto w-full max-w-5xl space-y-8 px-4 pb-16">
      <h1 className="pt-4 text-2xl font-bold">Alertas</h1>

      <NotificationSettings />

      <section>
        <h2 className="pb-2 font-semibold">Nueva alerta</h2>
        <AlertForm />
      </section>

      <section>
        <h2 className="pb-2 font-semibold">Mis alertas</h2>
        {alerts.error && <p className="text-sm text-down">{alerts.error}</p>}
        {alerts.rows === null ? (
          <p className="text-muted">Cargando…</p>
        ) : alerts.rows.length === 0 ? (
          <p className="text-muted">No tienes alertas. Crea una arriba o desde la página de un activo.</p>
        ) : (
          <ul className="divide-y divide-line">
            {alerts.rows.map((a) => (
              <li key={a.id} className="flex items-center gap-3 py-3">
                <Link href={`/activo/${encodeURIComponent(a.symbol)}`} className="min-w-0 flex-1">
                  <div className={a.active ? "" : "text-muted line-through"}>{describeAlert(a)}</div>
                  <div className="text-xs text-muted">
                    {status(a)}
                    {a.last_triggered_at && ` · Última vez ${when(a.last_triggered_at)}`}
                  </div>
                </Link>
                {isPriceAlert(a.kind) && !a.active && (
                  <button
                    onClick={() => alerts.mutate((db) => db.from("alerts").update({ active: true }).eq("id", a.id))}
                    className="rounded-md border border-line px-2 py-1 text-sm"
                  >
                    Reactivar
                  </button>
                )}
                <button
                  onClick={() => alerts.mutate((db) => db.from("alerts").delete().eq("id", a.id))}
                  title="Eliminar alerta"
                  className="px-2 text-muted hover:text-down"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between pb-2">
          <h2 className="font-semibold">Historial</h2>
          {!!events.rows?.length && (
            <button
              onClick={() => confirm("¿Borrar el historial?") && events.mutate((db) => db.from("alert_events").delete().not("id", "is", null))}
              className="text-sm text-muted hover:underline"
            >
              Borrar historial
            </button>
          )}
        </div>
        {events.rows?.length ? (
          <ul className="divide-y divide-line">
            {events.rows.slice(0, 50).map((e) => (
              <li key={e.id} className="py-3">
                <div className="flex justify-between gap-3">
                  <Link href={`/activo/${encodeURIComponent(e.symbol)}`} className="font-semibold">
                    {e.title}
                  </Link>
                  <span className="shrink-0 text-xs text-muted">{when(e.created_at)}</span>
                </div>
                <p className="text-sm text-muted">{e.body}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-muted">Aquí verás las alertas que se disparen.</p>
        )}
      </section>

      <p className="text-xs text-muted">
        El servidor revisa las alertas de precio cada minuto, aunque tengas la app cerrada; las de señal e indicadores, cada hora. Las acciones
        de Colombia llegan con unos 15 minutos de retraso. Las señales son orientativas y no constituyen asesoría financiera.
      </p>
    </main>
  );
}

function status(a: Alert): string {
  if (isPriceAlert(a.kind)) return a.active ? "Activa" : "Disparada (se desactivó)";
  if (isIndicatorAlert(a.kind)) {
    if (!a.last_state) return "Activa · esperando la primera revisión";
    return `Activa · ahora ${a.last_state === "arriba" ? "por encima" : "por debajo"}`;
  }
  if (!a.last_verdict) return "Activa · esperando la primera revisión";
  return `Activa · señal actual: ${VERDICT_LABEL[a.last_verdict]}`;
}
