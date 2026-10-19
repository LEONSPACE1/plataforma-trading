"use client";

import { useEffect, useState } from "react";
import { apiFetch, supabase } from "@/lib/supabase/client";

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

const button = "rounded-md border border-line px-3 py-1.5 text-sm";

/** Turns on push for this device, links Telegram and sends a test. */
export function NotificationSettings() {
  return (
    <section className="space-y-4 rounded-lg border border-line p-4">
      <h2 className="font-semibold">Dónde recibir las alertas</h2>
      <PushSetting />
      <TelegramSetting />
      <TestButton />
      <SummarySetting />
    </section>
  );
}

type PushState = "unsupported" | "ios-install" | "unconfigured" | "denied" | "off" | "on" | "loading";

function PushSetting() {
  const [state, setState] = useState<PushState>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const check = async () => {
      const standalone = window.matchMedia("(display-mode: standalone)").matches;
      if (/iPad|iPhone|iPod/.test(navigator.userAgent) && !standalone) return setState("ios-install");
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) return setState("unsupported");
      if (!VAPID_PUBLIC_KEY) return setState("unconfigured");
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
      setState((await reg.pushManager.getSubscription()) ? "on" : "off");
    };
    check().catch((e) => {
      setError(e instanceof Error ? e.message : String(e));
      setState("unsupported");
    });
  }, []);

  const enable = async () => {
    setError(null);
    try {
      if ((await Notification.requestPermission()) !== "granted") return setState("denied");
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY!),
      });
      await apiFetch("/api/push", { body: sub.toJSON() });
      setState("on");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const disable = async () => {
    setError(null);
    try {
      const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
      if (sub) {
        await apiFetch("/api/push", { method: "DELETE", body: { endpoint: sub.endpoint } });
        await sub.unsubscribe();
      }
      setState("off");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const text: Record<PushState, string> = {
    loading: "Revisando…",
    unsupported: "Este navegador no admite notificaciones push.",
    "ios-install": "En iPhone las notificaciones solo funcionan con la app instalada: toca Compartir y «Agregar a pantalla de inicio», y ábrela desde el ícono.",
    unconfigured: "Las notificaciones push aún no están configuradas en el servidor (faltan las claves VAPID).",
    denied: "Bloqueaste las notificaciones para este sitio. Actívalas en los ajustes del navegador o del celular.",
    off: "Desactivadas en este dispositivo.",
    on: "Activadas en este dispositivo.",
  };

  return (
    <div>
      <h3 className="text-sm font-semibold">Notificaciones en este dispositivo</h3>
      <p className="text-sm text-muted">{text[state]}</p>
      {state === "off" && (
        <button onClick={enable} className={`${button} mt-2 bg-accent text-white`}>
          Activar notificaciones
        </button>
      )}
      {state === "on" && (
        <button onClick={disable} className={`${button} mt-2`}>
          Desactivar en este dispositivo
        </button>
      )}
      {error && <p className="text-sm text-down">{error}</p>}
    </div>
  );
}

function TelegramSetting() {
  const [linked, setLinked] = useState<boolean | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    const { data } = await supabase().from("telegram_links").select("chat_id").maybeSingle();
    setLinked(Boolean(data?.chat_id));
  };
  useEffect(() => {
    // Loads after the awaited query, not synchronously.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, []);

  const start = async () => {
    setError(null);
    try {
      const { url } = await apiFetch<{ url: string }>("/api/telegram", { body: { action: "start" } });
      setLink(url);
      window.open(url, "_blank");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const check = async () => {
    setError(null);
    try {
      const r = await apiFetch<{ linked: boolean }>("/api/telegram", { body: { action: "check" } });
      setLinked(r.linked);
      if (r.linked) setLink(null);
      else setError("Aún no vemos tu mensaje. En Telegram toca «Iniciar» (o envía el mensaje /start) y vuelve a intentar.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const unlink = async () => {
    await supabase().from("telegram_links").delete().not("user_id", "is", null);
    await refresh();
  };

  return (
    <div>
      <h3 className="text-sm font-semibold">Telegram</h3>
      {linked === null ? (
        <p className="text-sm text-muted">Revisando…</p>
      ) : linked ? (
        <>
          <p className="text-sm text-muted">Vinculado. Las alertas también te llegan por Telegram.</p>
          <button onClick={unlink} className={`${button} mt-2`}>
            Desvincular
          </button>
        </>
      ) : (
        <>
          <p className="text-sm text-muted">
            Sin vincular. Toca el botón, se abre Telegram con nuestro bot y le das «Iniciar».
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button onClick={start} className={`${button} bg-accent text-white`}>
              Vincular Telegram
            </button>
            {link && (
              <>
                <a href={link} target="_blank" rel="noreferrer" className={button}>
                  Abrir el bot otra vez
                </a>
                <button onClick={check} className={button}>
                  Ya le di Iniciar
                </button>
              </>
            )}
          </div>
        </>
      )}
      {error && <p className="text-sm text-down">{error}</p>}
    </div>
  );
}

function TestButton() {
  const [result, setResult] = useState<string | null>(null);
  const test = async () => {
    setResult("Enviando…");
    try {
      const r = await apiFetch<{ push: number; telegram: boolean; errors: string[] }>("/api/notify-test", { body: {} });
      const parts = [
        r.push ? `${r.push} dispositivo${r.push > 1 ? "s" : ""}` : null,
        r.telegram ? "Telegram" : null,
      ].filter(Boolean);
      setResult(
        parts.length
          ? `Enviada a ${parts.join(" y ")}.${r.errors.length ? ` Errores: ${r.errors.join("; ")}` : ""}`
          : `No hay ningún canal activo.${r.errors.length ? ` Errores: ${r.errors.join("; ")}` : ""}`,
      );
    } catch (e) {
      setResult(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <div>
      <button onClick={test} className={button}>
        Enviar notificación de prueba
      </button>
      {result && <p className="mt-1 text-sm text-muted">{result}</p>}
    </div>
  );
}

function SummarySetting() {
  const [on, setOn] = useState<boolean | null>(null);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    supabase()
      .from("user_settings")
      .select("daily_summary")
      .maybeSingle()
      .then(({ data }) => setOn(data?.daily_summary ?? true));
  }, []);

  const toggle = async (value: boolean) => {
    setOn(value);
    const { data } = await supabase().auth.getUser();
    const { error } = await supabase()
      .from("user_settings")
      .upsert({ user_id: data.user?.id, daily_summary: value, updated_at: new Date().toISOString() });
    if (error) {
      setOn(!value);
      setResult(error.message);
    }
  };

  const sendNow = async () => {
    setResult("Enviando…");
    try {
      const r = await apiFetch<{ push: number; telegram: boolean; errors: string[] }>("/api/summary-test", { body: {} });
      const parts = [r.push ? `${r.push} dispositivo${r.push > 1 ? "s" : ""}` : null, r.telegram ? "Telegram" : null].filter(Boolean);
      setResult(parts.length ? `Resumen enviado a ${parts.join(" y ")}.` : "No hay ningún canal activo.");
    } catch (e) {
      setResult(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div>
      <h3 className="text-sm font-semibold">Resumen diario</h3>
      <label className="flex items-center gap-2 text-sm text-muted">
        <input type="checkbox" checked={on ?? true} disabled={on === null} onChange={(e) => toggle(e.target.checked)} />
        De lunes a viernes a las 4:15 p. m. (hora de Colombia): lo que más se movió en tus listas, el resultado del día de tu
        portafolio, las señales que cambiaron y los resultados o dividendos de la próxima sesión.
      </label>
      <button onClick={sendNow} className={`${button} mt-2`}>
        Enviarme el resumen ahora
      </button>
      {result && <p className="mt-1 text-sm text-muted">{result}</p>}
    </div>
  );
}
