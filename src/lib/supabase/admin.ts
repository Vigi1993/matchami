import { createClient } from "@supabase/supabase-js";

/**
 * Client con la chiave di servizio: ignora la sicurezza a livello di riga
 * e può fare qualunque cosa sul progetto, compresa la cancellazione di
 * utenti e file.
 *
 * REGOLE:
 *  - si importa SOLO da codice che gira sul server (azioni e route
 *    handler), mai da un componente client: la chiave finirebbe nel
 *    browser di chiunque;
 *  - si usa solo dopo aver stabilito CHI sta chiedendo, e si agisce
 *    sull'id dell'utente autenticato, mai su un id che arriva dal client;
 *  - la variabile d'ambiente NON deve cominciare con NEXT_PUBLIC_.
 *
 * Restituisce `null` se la chiave non è configurata, così chi chiama può
 * dare un messaggio chiaro invece di fallire in modo oscuro.
 */
export function clienteAmministratore() {
  if (typeof window !== "undefined") {
    throw new Error("clienteAmministratore va usato solo sul server");
  }
  const chiave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!chiave || !url) return null;

  return createClient(url, chiave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
