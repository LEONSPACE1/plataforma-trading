"use client";

import { useState } from "react";
import { RequireAuth } from "@/components/auth";
import { Header } from "@/components/header";
import { useQuotes, useWatchlists } from "@/components/hooks";
import { QuoteTable } from "@/components/quote-table";
import { CATALOG, MARKET_GROUPS } from "@/lib/market/catalog";
import type { MarketGroup } from "@/lib/market/types";

type Tab = "lists" | MarketGroup;

export default function Home() {
  return (
    <RequireAuth>
      <Header />
      <Dashboard />
    </RequireAuth>
  );
}

function Dashboard() {
  const [tab, setTab] = useState<Tab>("lists");
  const watchlists = useWatchlists();
  const [listId, setListId] = useState<string | null>(null);
  const activeList = watchlists.lists?.find((l) => l.id === listId) ?? watchlists.lists?.[0];

  const symbols =
    tab === "lists" ? (activeList?.symbols ?? []) : CATALOG[tab].entries.map((e) => e.symbol);
  const { results, updatedAt } = useQuotes(symbols);
  const inActive = new Set(activeList?.symbols ?? []);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 pb-16">
      <nav className="-mx-4 flex gap-1 overflow-x-auto px-4 py-3">
        {(["lists", ...MARKET_GROUPS] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${
              tab === t ? "bg-accent text-white" : "border border-line"
            }`}
          >
            {t === "lists" ? "Mis listas" : CATALOG[t].label}
          </button>
        ))}
      </nav>

      {watchlists.error && <p className="text-sm text-down">{watchlists.error}</p>}

      {tab === "lists" && (
        <ListPicker
          lists={watchlists.lists ?? []}
          activeId={activeList?.id}
          onSelect={setListId}
          onCreate={watchlists.createList}
          onDelete={(id) => {
            watchlists.deleteList(id);
            setListId(null);
          }}
        />
      )}

      <QuoteTable
        symbols={symbols}
        results={results}
        action={
          activeList
            ? (symbol) =>
                inActive.has(symbol) ? (
                  <button
                    onClick={() => watchlists.removeSymbol(activeList.id, symbol)}
                    title={`Quitar de ${activeList.name}`}
                    className="px-2 text-lg text-accent"
                  >
                    ★
                  </button>
                ) : (
                  <button
                    onClick={() => watchlists.addSymbol(activeList.id, symbol)}
                    title={`Agregar a ${activeList.name}`}
                    className="px-2 text-lg text-muted"
                  >
                    ☆
                  </button>
                )
            : undefined
        }
      />

      {updatedAt && (
        <p className="mt-4 text-xs text-muted">
          Actualizado {updatedAt.toLocaleTimeString("es-CO")}. Se refresca cada 15 segundos.
        </p>
      )}
    </main>
  );
}

function ListPicker(props: {
  lists: { id: string; name: string }[];
  activeId?: string;
  onSelect: (id: string) => void;
  onCreate: (name: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 pb-2 text-sm">
      <select
        value={props.activeId ?? ""}
        onChange={(e) => props.onSelect(e.target.value)}
        className="rounded-md border border-line bg-surface px-2 py-1.5"
      >
        {props.lists.map((l) => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>
      <button
        onClick={() => {
          const name = prompt("Nombre de la nueva lista")?.trim();
          if (name) props.onCreate(name);
        }}
        className="rounded-md border border-line px-2 py-1.5"
      >
        Nueva lista
      </button>
      {props.activeId && props.lists.length > 1 && (
        <button
          onClick={() => confirm("¿Eliminar esta lista?") && props.onDelete(props.activeId!)}
          className="rounded-md border border-line px-2 py-1.5 text-down"
        >
          Eliminar lista
        </button>
      )}
      <span className="text-muted">Usa ☆ en cualquier pestaña para agregar activos a la lista elegida.</span>
    </div>
  );
}
