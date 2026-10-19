"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { SearchResult } from "@/lib/market/types";
import { apiFetch, supabase } from "@/lib/supabase/client";
import { useSession } from "./auth";

const NAV = [
  { href: "/", label: "Mercado" },
  { href: "/portafolio", label: "Portafolio" },
  { href: "/alertas", label: "Alertas" },
];

export function Header() {
  const session = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const timer = setTimeout(() => {
      apiFetch<{ results: SearchResult[] }>(`/api/search?q=${encodeURIComponent(q)}`)
        .then((r) => setResults(r.results))
        .catch(() => setResults([]));
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const open = (symbol: string) => {
    setQuery("");
    setResults([]);
    router.push(`/activo/${encodeURIComponent(symbol)}`);
  };

  return (
    <header className="sticky top-0 z-10 border-b border-line bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
        <Link href="/" className="shrink-0 font-bold">
          Plataforma Trading
        </Link>
        <div className="relative flex-1">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && query.trim()) open(results[0]?.symbol ?? query.trim().toUpperCase());
            }}
            placeholder="Buscar activo (ej. Ecopetrol, AAPL, USDCOP=X)"
            className="w-full rounded-md border border-line bg-surface px-3 py-2 text-sm"
          />
          {query.trim().length >= 2 && results.length > 0 && (
            <ul className="absolute inset-x-0 top-full mt-1 max-h-80 overflow-auto rounded-md border border-line bg-surface shadow-lg">
              {results.map((r) => (
                <li key={r.symbol}>
                  <button onClick={() => open(r.symbol)} className="w-full px-3 py-2 text-left text-sm hover:bg-line">
                    <span className="font-semibold">{r.symbol}</span> <span className="text-muted">{r.name}</span>
                    <span className="float-right text-xs text-muted">{r.exchange}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          onClick={() => supabase().auth.signOut()}
          className="shrink-0 text-sm text-muted hover:underline"
          title={session.user.email}
        >
          Salir
        </button>
      </div>
      <nav className="mx-auto flex max-w-5xl gap-4 px-4 pb-2 text-sm">
        {NAV.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className={pathname === n.href ? "font-semibold text-accent" : "text-muted hover:text-foreground"}
          >
            {n.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
