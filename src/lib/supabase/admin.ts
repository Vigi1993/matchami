import { createClient } from "@supabase/supabase-js";
import { chiaveDiServizioDaAmbiente } from "@/lib/chiavi";

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
 * La chiave è `SUPABASE_SECRET_KEY` (quella segreta, `sb_secret_...`). Si
 * accetta anche il vecchio nome `SUPABASE_SERVICE_ROLE_KEY`. Una chiave
 * sbagliata, per esempio quella pubblica incollata per errore, viene
 * rifiutata con un motivo nel log.
 *
 * Restituisce `null` se la chiave manca o non è quella giusta, così chi
 * chiama può dare un messaggio chiaro invece di fallire in modo oscuro.
 */
export function clienteAmministratore() {
  if (typeof window !== "undefined") {
    throw new Error("clienteAmministratore va usato solo sul server");
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const esito = chiaveDiServizioDaAmbiente(process.env);
  if (!esito.ok) {
    console.error("clienteAmministratore: chiave di servizio non utilizzabile:", esito.motivo);
    return null;
  }
  if (!url) {
    console.error("clienteAmministratore: manca NEXT_PUBLIC_SUPABASE_URL");
    return null;
  }

  return createClient(url, esito.chiave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
