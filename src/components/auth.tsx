"use client";

import type { Session } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { SUPABASE_CONFIG_ERROR, supabase } from "@/lib/supabase/client";

const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const session = useContext(SessionContext);
  if (!session) throw new Error("useSession debe usarse dentro de <RequireAuth>");
  return session;
}

/** Renders children only for a signed-in member; sends everyone else to /login. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    if (SUPABASE_CONFIG_ERROR) return;
    const client = supabase();
    client.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = client.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session === null) router.replace("/login");
  }, [session, router]);

  if (SUPABASE_CONFIG_ERROR) return <p className="p-6 text-down">{SUPABASE_CONFIG_ERROR}</p>;
  if (!session) return <p className="p-6 text-muted">Cargando…</p>;
  return <SessionContext value={session}>{children}</SessionContext>;
}
