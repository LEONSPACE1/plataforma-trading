"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/supabase/client";

/** GETs one of our /api routes whenever `path` changes; null `path` skips the call. */
export function useApi<T>(path: string | null) {
  const [state, setState] = useState<{ path: string; data?: T; error?: string } | null>(null);

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    apiFetch<T>(path)
      .then((data) => !cancelled && setState({ path, data }))
      .catch((e) => !cancelled && setState({ path, error: e instanceof Error ? e.message : String(e) }));
    return () => {
      cancelled = true;
    };
  }, [path]);

  const current = state?.path === path ? state : null;
  return { data: current?.data, error: current?.error, loading: path != null && !current };
}
