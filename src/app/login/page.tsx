"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SUPABASE_CONFIG_ERROR, supabase } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (SUPABASE_CONFIG_ERROR) return;
    // The magic link lands here with the session in the URL; once Supabase
    // picks it up, go to the dashboard.
    const { data } = supabase().auth.onAuthStateChange((_e, session) => {
      if (session) router.replace("/");
    });
    return () => data.subscription.unsubscribe();
  }, [router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("sending");
    const { error } = await supabase().auth.signInWithOtp({
      email: email.trim(),
      // Invite-only: an email that wasn't invited gets no account.
      options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/login` },
    });
    if (error) {
      setStatus("error");
      setMessage(
        error.message.includes("Signups not allowed")
          ? "Este correo no tiene invitación. Pídele acceso al administrador."
          : error.message,
      );
    } else {
      setStatus("sent");
    }
  };

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center px-4 py-16">
      <h1 className="text-2xl font-bold">Plataforma Trading</h1>
      <p className="pb-6 text-muted">Acceso solo por invitación.</p>
      {status === "sent" ? (
        <p>Te enviamos un enlace a {email}. Ábrelo en este dispositivo para entrar.</p>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="tu@correo.com"
            className="rounded-md border border-line bg-surface px-3 py-2"
          />
          <button disabled={status === "sending"} className="rounded-md bg-accent px-3 py-2 text-white disabled:opacity-60">
            {status === "sending" ? "Enviando…" : "Enviar enlace de acceso"}
          </button>
          {status === "error" && <p className="text-sm text-down">{message}</p>}
        </form>
      )}
    </main>
  );
}
