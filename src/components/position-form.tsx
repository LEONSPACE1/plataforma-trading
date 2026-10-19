"use client";

import { useState } from "react";
import { isValidSymbol } from "@/lib/market/symbols";
import { supabase } from "@/lib/supabase/client";

const today = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD in local time

const input = "rounded-md border border-line bg-surface px-2 py-1.5 text-sm";

/** Records a purchase. With `symbol` the asset is fixed (asset page); otherwise the user types it. */
export function PositionForm({ symbol, price }: { symbol?: string; price?: number }) {
  const [form, setForm] = useState({ symbol: symbol ?? "", quantity: "", buyPrice: "", date: today(), note: "" });
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const sym = (symbol ?? form.symbol).trim().toUpperCase();
    const quantity = Number(form.quantity.replace(",", "."));
    const buyPrice = Number((form.buyPrice || String(price ?? "")).replace(",", "."));
    if (!isValidSymbol(sym)) return setStatus({ ok: false, text: "Símbolo inválido." });
    if (!(quantity > 0) || !(buyPrice > 0)) return setStatus({ ok: false, text: "La cantidad y el precio deben ser mayores que cero." });
    const { error } = await supabase().from("positions").insert({
      symbol: sym,
      quantity,
      buy_price: buyPrice,
      bought_on: form.date || today(),
      note: form.note.trim() || null,
    });
    if (error) return setStatus({ ok: false, text: error.message });
    setStatus({ ok: true, text: `Compra de ${sym} guardada en tu portafolio.` });
    setForm({ symbol: symbol ?? "", quantity: "", buyPrice: "", date: today(), note: "" });
  };

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
      {!symbol && (
        <label className="flex flex-col text-xs text-muted">
          Símbolo
          <input value={form.symbol} onChange={set("symbol")} placeholder="AAPL, ECOPETROL.CL" className={`${input} w-36 uppercase`} required />
        </label>
      )}
      <label className="flex flex-col text-xs text-muted">
        Cantidad
        <input value={form.quantity} onChange={set("quantity")} inputMode="decimal" className={`${input} w-24`} required />
      </label>
      <label className="flex flex-col text-xs text-muted">
        Precio de compra
        <input
          value={form.buyPrice}
          onChange={set("buyPrice")}
          inputMode="decimal"
          placeholder={price ? String(price) : ""}
          className={`${input} w-32`}
          required={!price}
        />
      </label>
      <label className="flex flex-col text-xs text-muted">
        Fecha
        <input type="date" value={form.date} onChange={set("date")} max={today()} className={input} />
      </label>
      <label className="flex flex-col text-xs text-muted">
        Nota (opcional)
        <input value={form.note} onChange={set("note")} maxLength={200} className={`${input} w-40`} />
      </label>
      <button className="rounded-md bg-accent px-3 py-1.5 text-sm text-white">Agregar compra</button>
      {status && <p className={`w-full text-sm ${status.ok ? "text-up" : "text-down"}`}>{status.text}</p>}
    </form>
  );
}
