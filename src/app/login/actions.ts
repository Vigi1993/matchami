"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { percorsoInterno } from "@/lib/percorso";
import { PERCORSO_RESET } from "@/lib/recupero";

async function origine(): Promise<string | null> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return null;
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

export type AuthState = { error?: string } | null;

export async function signup(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");
  const nome = String(formData.get("nome") || "");
  const cognome = String(formData.get("cognome") || "");
  const ruolo = String(formData.get("ruolo") || "inquilino");
  const privacyAccettata = formData.get("privacy") === "on";
  const next = percorsoInterno(String(formData.get("next") ?? ""));

  if (!privacyAccettata) {
    return { error: "Devi accettare la privacy per continuare." };
  }
  if (password.length < 8) {
    return { error: "La password deve avere almeno 8 caratteri." };
  }

  const supabase = await createClient();

  const base = await origine();

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // dopo la conferma email l'utente torna dove stava andando
      emailRedirectTo: base
        ? `${base}/auth/callback?next=${encodeURIComponent(next)}`
        : undefined,
      data: {
        nome,
        cognome,
        ruolo,
        privacy_accettata: true,
      },
    },
  });

  if (error) {
    return { error: error.message };
  }

  redirect("/auth/check-email");
}

export async function login(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  const email = String(formData.get("email") || "");
  const password = String(formData.get("password") || "");
  const next = percorsoInterno(String(formData.get("next") ?? ""));

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "Email o password non corrette." };
  }

  redirect(next);
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export type RecuperoState = { messaggio?: string; error?: string } | null;

/**
 * Manda il link per reimpostare la password.
 *
 * La risposta è SEMPRE la stessa, che l'indirizzo sia registrato o no:
 * altrimenti questo modulo permetterebbe a chiunque di scoprire se una
 * persona ha un account.
 */
export async function richiediReset(
  _prevState: RecuperoState,
  formData: FormData
): Promise<RecuperoState> {
  const email = String(formData.get("email") || "").trim().toLowerCase();
  if (!email.includes("@")) {
    return { error: "Inserisci un indirizzo email valido." };
  }

  const supabase = await createClient();
  const base = await origine();

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: base
      ? `${base}/auth/callback?next=${encodeURIComponent(PERCORSO_RESET)}`
      : undefined,
  });

  // Un errore qui è quasi sempre il limite di invii di Supabase. Non si
  // distingue "indirizzo sconosciuto" da "riuscito": per quello Supabase
  // non restituisce errore.
  if (error) {
    return {
      error:
        "Non riesco a mandare l'email in questo momento. Riprova tra qualche minuto.",
    };
  }

  return {
    messaggio:
      "Se l'indirizzo è registrato, riceverai un'email con il link per scegliere una nuova password. Aprilo dallo stesso browser da cui l'hai chiesto.",
  };
}
