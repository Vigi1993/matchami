import { createClient } from "@supabase/supabase-js";

/**
 * Verifica che chi sta facendo un'operazione delicata conosca la password
 * attuale.
 *
 * Supabase non la richiede per cambiare email o password, né per altro:
 * senza questo controllo chiunque trovasse una sessione aperta (un
 * telefono lasciato sbloccato) potrebbe prendersi l'account. Si usa un
 * client separato con `persistSession: false`, così il login di verifica
 * non tocca i cookie della sessione in corso.
 *
 * Usata da "Account e accesso" (email, password) e dalla cancellazione
 * dell'account: è la stessa regola, in un posto solo.
 */
export async function passwordCorretta(
  email: string,
  password: string
): Promise<boolean> {
  const verifica = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

  const { error } = await verifica.auth.signInWithPassword({ email, password });
  return !error;
}
