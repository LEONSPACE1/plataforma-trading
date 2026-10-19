"use client";

import type { NewsItem } from "@/lib/market/types";
import { useApi } from "./use-api";

const ago = (unix: number) => {
  const minutes = Math.max(0, Math.round((Date.now() / 1000 - unix) / 60));
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `hace ${hours} h`;
  return new Date(unix * 1000).toLocaleDateString("es-CO", { day: "numeric", month: "short" });
};

/** Latest headlines about the asset: Yahoo Finance for US listings, Google News in Spanish for Colombian shares. */
export function NewsList({ symbol }: { symbol: string }) {
  const { data, error, loading } = useApi<{ news: NewsItem[]; source: "yahoo" | "google" }>(`/api/news?symbol=${encodeURIComponent(symbol)}`);

  return (
    <section className="mt-8">
      <h2 className="pb-2 text-lg font-semibold">Noticias</h2>
      {loading ? (
        <p className="text-muted">Buscando noticias…</p>
      ) : error ? (
        <p className="text-down">No se pudieron cargar las noticias: {error}</p>
      ) : !data?.news.length ? (
        <p className="text-muted">No hay noticias recientes de este activo.</p>
      ) : (
        <ul className="divide-y divide-line">
          {data.news.map((n) => (
            <li key={n.id} className="py-2.5">
              <a href={n.url} target="_blank" rel="noreferrer" className="font-medium hover:underline">
                {n.title}
              </a>
              <div className="text-xs text-muted">
                {n.publisher} · {ago(n.time)}
                {n.related.length > 1 && ` · ${n.related.filter((s) => s !== symbol).slice(0, 4).join(", ")}`}
              </div>
            </li>
          ))}
        </ul>
      )}
      {data && (
        <p className="pt-2 text-xs text-muted">
          {data.source === "google"
            ? "Titulares de Google Noticias buscados por el nombre de la empresa, así que algunos pueden ser de temas cercanos."
            : "Titulares de Yahoo Finance, en su mayoría en inglés."}{" "}
          Se abren en el sitio de cada medio.
        </p>
      )}
    </section>
  );
}
