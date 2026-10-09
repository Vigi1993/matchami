"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fornitoreMappe } from "@/lib/mappe";
import { posizioneValida, validaIndirizzo } from "@/lib/mappe/indirizzo";
import type { Posizione } from "@/lib/mappe/tipi";
import { messaggioErroreVerifica } from "@/lib/verifica";

export type EsitoIndirizzo = { ok: true } | { error: string };

/**
 * Salva l'indirizzo di un immobile: lo controlla, ne calcola la posizione con il
 * fornitore di mappe scelto (quello provvisorio, per ora) e lo scrive con la
 * funzione del database, che ricontrolla tutto e verifica che l'immobile sia di
 * chi chiama. L'indirizzo lo vedranno solo le persone con un match accettato.
 */
export async function salvaIndirizzo(
  listingId: string,
  input: { via: string; civico: string; cap: string; citta: string }
): Promise<EsitoIndirizzo> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non autenticato." };

  const esito = validaIndirizzo(input);
  if (!esito.ok) return { error: esito.errore };

  // la zona serve al fornitore provvisorio; l'immobile deve essere di chi chiama
  const { data: annuncio } = await supabase
    .from("listings")
    .select("zona")
    .eq("id", listingId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!annuncio) return { error: messaggioErroreVerifica("IMMOBILE_NON_TUO") };

  let fornitore;
  try {
    fornitore = fornitoreMappe();
  } catch {
    return { error: "La mappa non è configurata correttamente. Avvisa chi gestisce l'app." };
  }

  let posizione: Posizione | null;
  try {
    posizione = await fornitore.geocodifica(esito.indirizzo, { zona: annuncio.zona });
  } catch {
    return { error: "Il servizio delle mappe non risponde. Riprova tra poco." };
  }
  if (!posizioneValida(posizione)) {
    return { error: "Non trovo questo indirizzo sulla mappa. Controlla via, civico e CAP." };
  }

  const { error } = await supabase.rpc("imposta_indirizzo", {
    p_listing: listingId,
    p_via: esito.indirizzo.via,
    p_civico: esito.indirizzo.civico,
    p_cap: esito.indirizzo.cap,
    p_citta: esito.indirizzo.citta,
    p_latitudine: posizione.latitudine,
    p_longitudine: posizione.longitudine,
    p_origine: fornitore.origine,
  });
  if (error) return { error: messaggioErroreVerifica(error.message) };

  revalidatePath("/immobili");
  return { ok: true };
}

export async function rimuoviIndirizzo(listingId: string): Promise<EsitoIndirizzo> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non autenticato." };

  const { error } = await supabase.rpc("rimuovi_indirizzo", { p_listing: listingId });
  if (error) return { error: messaggioErroreVerifica(error.message) };

  revalidatePath("/immobili");
  return { ok: true };
}
