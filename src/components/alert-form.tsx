"use client";

import { useState } from "react";
import { ALERT_KINDS, describeAlert, isPriceAlert, isRsiAlert, needsTarget, type AlertKind } from "@/lib/alerts/rules";
import { isValidSymbol } from "@/lib/market/symbols";
import { supabase } from "@/lib/supabase/client";

const input = "rounded-md border border-line bg-surface px-2 py-1.5 text-sm";

/** Creates a price or signal alert. With `symbol` the asset is fixed (asset page). */
export function AlertForm({ symbol, price }: { symbol?: string; price?: number }) {
  const [sym, setSym] = useState(symbol ?? "");
  const [kind, setKind] = useState<AlertKind>("price_above");
  const [target, setTarget] = useState("");
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const s = (symbol ?? sym).trim().toUpperCase();
    if (!isValidSymbol(s)) return setStatus({ ok: false, text: "Símbolo inválido." });
    const value = needsTarget(kind) ? Number(target.replace(",", ".")) : null;
    if (value !== null && !(value > 0)) return setStatus({ ok: false, text: isRsiAlert(kind) ? "Escribe el nivel de RSI." : "Escribe el precio objetivo." });
    if (value !== null && isRsiAlert(kind) && value >= 100) return setStatus({ ok: false, text: "El RSI va de 0 a 100." });
    const { error } = await supabase().from("alerts").insert({ symbol: s, kind, target: value });
    if (error) return setStatus({ ok: false, text: error.message });
    setStatus({ ok: true, text: `Alerta creada: ${describeAlert({ symbol: s, kind, target: value })}.` });
    setTarget("");
    if (!symbol) setSym("");
  };

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
      {!symbol && (
        <label className="flex flex-col text-xs text-muted">
          Símbolo
          <input value={sym} onChange={(e) => setSym(e.target.value)} placeholder="AAPL, ECOPETROL.CL" className={`${input} w-36 uppercase`} required />
        </label>
      )}
      <label className="flex flex-col text-xs text-muted">
        Avisarme cuando
        <select
          value={kind}
          onChange={(e) => {
            const next = e.target.value as AlertKind;
            setKind(next);
            if (isRsiAlert(next)) setTarget(next === "rsi_above" ? "70" : "30");
            else if (isRsiAlert(kind)) setTarget("");
          }}
          className={input}
        >
          {ALERT_KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
      </label>
      {isRsiAlert(kind) && (
        <label className="flex flex-col text-xs text-muted">
          Nivel de RSI
          <input value={target} onChange={(e) => setTarget(e.target.value)} inputMode="decimal" className={`${input} w-24`} required />
        </label>
      )}
      {isPriceAlert(kind) && (
        <label className="flex flex-col text-xs text-muted">
          Precio objetivo
          <input
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            inputMode="decimal"
            placeholder={price ? `Ahora ${price.toLocaleString("es-CO")}` : ""}
            className={`${input} w-36`}
            required
          />
        </label>
      )}
      <button className="rounded-md bg-accent px-3 py-1.5 text-sm text-white">Crear alerta</button>
      {status && <p className={`w-full text-sm ${status.ok ? "text-up" : "text-down"}`}>{status.text}</p>}
      {!isPriceAlert(kind) && (
        <p className="w-full text-xs text-muted">
          {needsTarget(kind) || kind === "ma_cross" || kind === "macd_cross"
            ? "El indicador se revisa cada hora sobre velas diarias. La primera revisión guarda dónde está y te avisamos cuando cruce la línea."
            : "La señal se revisa cada hora. La primera revisión guarda la señal actual y te avisamos cuando pase a Comprar, Mantener o Vender."}
        </p>
      )}
    </form>
  );
}
