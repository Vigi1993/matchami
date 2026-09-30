"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

/**
 * Accetta solo percorsi interni: senza questo controllo `?next=` sarebbe
 * un redirect aperto verso qualunque sito.
 */
function destinazioneSicura(valore: FormDataEntryValue | null): string {
  const s = String(valore || "");
  return s.startsWith("/") && !s.startsWith("//") ? s : "/";
}

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
  const next = destinazioneSicura(formData.get("next"));

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
  const next = destinazioneSicura(formData.get("next"));

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
