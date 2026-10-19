"use client";

import Link from "next/link";
import type { QuoteResult } from "@/lib/market/provider";
import { catalogName } from "@/lib/market/catalog";
import { changeClass, formatChange, formatPrice } from "./format";

type Props = {
  symbols: string[];
  results: Record<string, QuoteResult>;
  /** Shown per row when given, e.g. a star to add or a cross to remove. */
  action?: (symbol: string) => React.ReactNode;
};

export function QuoteTable({ symbols, results, action }: Props) {
  if (symbols.length === 0) return <p className="py-6 text-muted">No hay activos en esta lista.</p>;

  return (
    <ul className="divide-y divide-line">
      {symbols.map((symbol) => {
        const r = results[symbol];
        const q = r?.quote;
        return (
          <li key={symbol} className="flex items-center gap-3 py-3">
            <Link href={`/activo/${encodeURIComponent(symbol)}`} className="min-w-0 flex-1">
              <div className="font-semibold">{symbol}</div>
              <div className="truncate text-sm text-muted">{q?.name ?? catalogName(symbol) ?? ""}</div>
            </Link>
            <div className="text-right tabular-nums">
              {q ? (
                <>
                  <div>{formatPrice(q.price, q.currency)}</div>
                  <div className={`text-sm ${changeClass(q.change)}`}>{formatChange(q.change, q.changePercent)}</div>
                  {q.delayMinutes > 0 && <div className="text-xs text-muted">Retraso {q.delayMinutes} min</div>}
                </>
              ) : r?.error ? (
                <div className="text-sm text-down" title={r.error}>Sin datos</div>
              ) : (
                <div className="text-sm text-muted">…</div>
              )}
            </div>
            {action && <div className="shrink-0">{action(symbol)}</div>}
          </li>
        );
      })}
    </ul>
  );
}
