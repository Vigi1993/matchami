"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { componiContratto } from "@/lib/contratto";
import { datiDaRiga } from "@/lib/contratto/dati";
import type { RigaContratto } from "@/lib/contratto/tipi";
import { fornitoreFirma } from "@/lib/firma";
import { improntaDocumento } from "@/lib/firma/impronta";
import { èUuid } from "@/lib/uuid";
import { messaggioErroreVerifica } from "@/lib/verifica";

export type EsitoFirmaAzione = { ok: true } | { error: string };

/**
 * Registra la FIRMA DI PROVA di chi chiama sul documento che il contratto produce ADESSO.
 *
 * L'impronta si calcola QUI, dal documento composto dai dati veri: non arriva dal browser, quindi una persona non
 * può dire «ho firmato questo» di un testo che non ha visto. Il database ricontrolla che sia una delle due parti,
 * che il contratto sia «in firma» e che l'impronta abbia la forma giusta.
 *
 * Questa azione registra SOLO firme di prova, e non cambia mai lo stato del contratto.
 */
export async function firmaContratto(contrattoId: string): Promise<EsitoFirmaAzione> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: messaggioErroreVerifica("NON_AUTENTICATO") };
  if (!èUuid(contrattoId)) return { error: messaggioErroreVerifica("FIRMA_CONTRATTO_NON_TUO") };

  // i dati del contratto: la funzione risponde solo alle due parti
  const { data, error: eDati } = await supabase.rpc("dati_contratto", { p_contratto: contrattoId });
  if (eDati) return { error: "Non è stato possibile preparare il documento da firmare. Riprova." };
  const dati = datiDaRiga((Array.isArray(data) ? data[0] : null) as Partial<RigaContratto> | null);
  if (!dati) return { error: messaggioErroreVerifica("FIRMA_CONTRATTO_NON_TUO") };

  let documento;
  try {
    documento = componiContratto(dati);
  } catch {
    return { error: "Il modello di contratto non è configurato correttamente." };
  }
  const impronta = improntaDocumento(documento);

  let servizio;
  try {
    servizio = fornitoreFirma();
  } catch {
    return { error: "Il servizio di firma non è configurato correttamente." };
  }
  // un servizio vero ha bisogno di una funzione sua nel database: da qui non si registra mai una firma vera come «di prova»
  if (servizio.origine !== "provvisoria") return { error: "Questa versione dell'app registra soltanto firme di prova." };

  const esito = await servizio.firma({ contrattoId, impronta, firmatario: user.id });
  if (!esito.ok) return { error: "Non è stato possibile registrare la firma. Riprova." };

  const { error } = await supabase.rpc("registra_firma_di_prova", {
    p_contratto: contrattoId,
    p_impronta: impronta,
    p_modello_id: documento.modello.id,
    p_modello_versione: documento.modello.versione,
  });
  if (error) return { error: messaggioErroreVerifica(error.message) };

  revalidatePath("/gestione");
  revalidatePath("/gestione-affitti");
  return { ok: true };
}

/** Ritira la PROPRIA firma di prova. */
export async function ritiraFirma(contrattoId: string): Promise<EsitoFirmaAzione> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: messaggioErroreVerifica("NON_AUTENTICATO") };
  if (!èUuid(contrattoId)) return { error: messaggioErroreVerifica("FIRMA_NON_TROVATA") };

  const { error } = await supabase.rpc("revoca_firma_di_prova", { p_contratto: contrattoId });
  if (error) return { error: messaggioErroreVerifica(error.message) };

  revalidatePath("/gestione");
  revalidatePath("/gestione-affitti");
  return { ok: true };
}
