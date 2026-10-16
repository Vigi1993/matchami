"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { messaggioErroreAffitto } from "@/lib/affitto-contratto";
import { eUuid } from "@/lib/richieste";

/**
 * L'inquilino risponde al contratto firmato: «l'affitto è cominciato, è tutto corretto» oppure «c'è qualcosa che non va». Tutte le
 * regole (il contratto è suo, è firmato, non ha già risposto, l'affitto è già cominciato) le controlla il database; qui si chiama e
 * si traduce l'errore in parole. Confermando nasce l'affitto «da verificare».
 */
export async function confermaAffitto(contrattoId: string, conferma: boolean): Promise<{ ok: true; confermato: boolean } | { ok: false; error: string }> {
  if (!eUuid(contrattoId) || typeof conferma !== "boolean") return { ok: false, error: messaggioErroreAffitto("CONTRATTO_NON_TUO: x") };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: messaggioErroreAffitto("NON_AUTENTICATO: x") };

  const { error } = await supabase.rpc("conferma_affitto_contratto", { p_contratto: contrattoId, p_conferma: conferma });
  if (error) return { ok: false, error: messaggioErroreAffitto(error.message) };

  revalidatePath("/gestione");
  revalidatePath("/gestione-affitti");
  revalidatePath("/profilo");
  return { ok: true, confermato: conferma };
}

/**
 * Una delle due parti ha caricato la copia del contratto (il file è già nell'archivio di verifica, nella sua cartella): si collega
 * all'affitto, che torna in attesa del controllo dello staff.
 */
export async function allegaDocumentoAffitto(rapportoId: string, percorso: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!eUuid(rapportoId) || typeof percorso !== "string" || percorso.length === 0 || percorso.length > 300) return { ok: false, error: messaggioErroreAffitto("PERCORSO_NON_VALIDO: x") };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: messaggioErroreAffitto("NON_AUTENTICATO: x") };

  const { error } = await supabase.rpc("allega_documento_rapporto", { p_rapporto: rapportoId, p_path: percorso });
  if (error) return { ok: false, error: messaggioErroreAffitto(error.message) };

  revalidatePath("/gestione");
  revalidatePath("/gestione-affitti");
  revalidatePath("/profilo");
  return { ok: true };
}
