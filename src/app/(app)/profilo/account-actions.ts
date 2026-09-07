"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient as createPlainClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export type AccountState = {
  error?: string;
  ok?: boolean;
  /** messaggio esteso da mostrare dopo un'operazione riuscita */
  messaggio?: string;
} | null;

/**
 * Verifica che chi sta facendo la modifica conosca la password attuale.
 *
 * Supabase non la richiede per `updateUser`, ma senza questo controllo
 * chiunque trovasse una sessione aperta potrebbe cambiare email e
 * password e prendersi l'account. Uso un client separato con
 * `persistSession: false` così il login di verifica non tocca i cookie
 * della sessione in corso.
 */
async function passwordCorretta(
  email: string,
  password: string
): Promise<boolean> {
  const verifica = createPlainClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { error } = await verifica.auth.signInWithPassword({ email, password });
  return !error;
}

/** Origine pubblica del sito, per costruire il link di conferma email. */
async function origine(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

// ------------------------------------------------------------
// Nome e cognome — vivono in `profiles`, nessuna password richiesta
// ------------------------------------------------------------

export async function updateNomeCognome(
  _prevState: AccountState,
  formData: FormData
): Promise<AccountState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non autenticato." };

  const nome = String(formData.get("nome") || "").trim();
  const cognome = String(formData.get("cognome") || "").trim();

  if (!nome) return { error: "Il nome non può restare vuoto." };

  const { error } = await supabase
    .from("profiles")
    .update({ nome, cognome: cognome || null, updated_at: new Date().toISOString() })
    .eq("id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/profilo");
  revalidatePath("/", "layout");
  return { ok: true, messaggio: "Nome aggiornato." };
}

// ------------------------------------------------------------
// Email — richiede la password attuale, poi parte una conferma
// ------------------------------------------------------------

export async function updateEmail(
  _prevState: AccountState,
  formData: FormData
): Promise<AccountState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Non autenticato." };

  const nuovaEmail = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password_attuale") || "");

  if (!nuovaEmail.includes("@")) {
    return { error: "Inserisci un indirizzo email valido." };
  }
  if (nuovaEmail === user.email.toLowerCase()) {
    return { error: "È già la tua email attuale." };
  }
  if (!password) {
    return { error: "Inserisci la password attuale per confermare." };
  }
  if (!(await passwordCorretta(user.email, password))) {
    return { error: "Password attuale non corretta." };
  }

  const { error } = await supabase.auth.updateUser(
    { email: nuovaEmail },
    { emailRedirectTo: `${await origine()}/auth/callback` }
  );

  if (error) return { error: error.message };

  return {
    ok: true,
    messaggio:
      `Ti abbiamo mandato un link di conferma a ${nuovaEmail}. ` +
      "Il cambio diventa effettivo solo dopo che lo avrai aperto: " +
      "fino ad allora continua ad accedere con l'email di prima.",
  };
}

// ------------------------------------------------------------
// Password — richiede quella attuale e la ripetizione della nuova
// ------------------------------------------------------------

export async function updatePassword(
  _prevState: AccountState,
  formData: FormData
): Promise<AccountState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { error: "Non autenticato." };

  const attuale = String(formData.get("password_attuale") || "");
  const nuova = String(formData.get("password_nuova") || "");
  const ripeti = String(formData.get("password_ripeti") || "");

  if (nuova.length < 8) {
    return { error: "La nuova password deve avere almeno 8 caratteri." };
  }
  if (nuova !== ripeti) {
    return { error: "Le due password non coincidono." };
  }
  if (nuova === attuale) {
    return { error: "La nuova password è uguale a quella attuale." };
  }
  if (!(await passwordCorretta(user.email, attuale))) {
    return { error: "Password attuale non corretta." };
  }

  const { error } = await supabase.auth.updateUser({ password: nuova });
  if (error) return { error: error.message };

  return { ok: true, messaggio: "Password aggiornata." };
}
