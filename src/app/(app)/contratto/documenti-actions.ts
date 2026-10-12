"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { clienteAmministratore } from "@/lib/supabase/admin";
import { svuotaCodaFile } from "@/lib/archivio";
import {
  BUCKET_DOCUMENTI_CONTRATTO,
  LIMITI_DOCUMENTI,
  nomeFilePulito,
  percorsoDiUtente,
  riconosciFile,
  tipoDocumentoValido,
} from "@/lib/documenti-contratto";
import { èUuid } from "@/lib/uuid";
import { messaggioErroreVerifica } from "@/lib/verifica";

export type EsitoDocumento = { ok: true } | { error: string };

/**
 * Registra un documento che la persona ha appena caricato nella SUA cartella dell'archivio.
 *
 * Il file lo ha mandato il browser direttamente all'archivio, quindi nome e tipo dichiarati non
 * valgono niente: qui si LEGGE il file e si guardano i suoi primi byte. Solo un PDF, un JPEG o un
 * PNG veri passano; la dimensione è quella vera. Se qualcosa non va il file si toglie subito
 * dall'archivio: un file respinto non deve restare lì.
 */
export async function registraDocumento(contrattoId: string, tipo: string, percorso: string, nomeFile: string): Promise<EsitoDocumento> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: messaggioErroreVerifica("NON_AUTENTICATO") };

  // un percorso che non è nella cartella di questa persona non si tocca, nemmeno per toglierlo
  if (!percorsoDiUtente(percorso, user.id)) return { error: messaggioErroreVerifica("FILE_NON_VALIDO") };

  const archivio = supabase.storage.from(BUCKET_DOCUMENTI_CONTRATTO);

  /**
   * Da qui in poi il file è della persona e sta nell'archivio: ogni rifiuto lo TOGLIE. Un file respinto
   * non ha una riga, quindi non è nemmeno nella coda: se non lo togliamo noi, resta lì per sempre.
   * Si prova con i permessi della persona e, se non riesce, con la chiave di servizio.
   */
  const togli = async () => {
    try {
      const { error } = await archivio.remove([percorso]);
      if (!error) return;
    } catch {
      // si prova con la chiave di servizio
    }
    const admin = clienteAmministratore();
    try {
      const { error } = admin ? await admin.storage.from(BUCKET_DOCUMENTI_CONTRATTO).remove([percorso]) : { error: { message: "nessuna chiave di servizio" } };
      if (error) console.error("registraDocumento: non sono riuscito a togliere un file respinto");
    } catch {
      console.error("registraDocumento: non sono riuscito a togliere un file respinto");
    }
  };
  const rifiuta = async (messaggio: string): Promise<EsitoDocumento> => {
    await togli();
    return { error: messaggio };
  };

  if (!èUuid(contrattoId)) return rifiuta(messaggioErroreVerifica("CONTRATTO_NON_TUO"));
  if (!tipoDocumentoValido(tipo)) return rifiuta(messaggioErroreVerifica("TIPO_DOCUMENTO_NON_VALIDO"));

  const nome = nomeFilePulito(nomeFile);
  if (nome === "") return rifiuta(messaggioErroreVerifica("NOME_FILE_NON_VALIDO"));

  const { data: blob, error: eLettura } = await archivio.download(percorso);
  if (eLettura || !blob) return rifiuta("Non riesco a leggere il file caricato. Riprova.");

  if (blob.size < 1 || blob.size > LIMITI_DOCUMENTI.maxByte) return rifiuta(messaggioErroreVerifica("FILE_NON_VALIDO"));

  const bytes = new Uint8Array(await blob.arrayBuffer());
  const riconosciuto = riconosciFile(bytes);
  // il contenuto deve essere ciò che l'estensione del percorso dice
  if (!riconosciuto || !percorso.endsWith(`.${riconosciuto.estensione}`)) return rifiuta("Il file non è un PDF, un JPG o un PNG valido.");

  const { error } = await supabase.rpc("registra_documento_contratto", {
    p_contratto: contrattoId,
    p_tipo: tipo,
    p_percorso: percorso,
    p_nome: nome,
    p_dimensione: bytes.length,
    p_tipo_file: riconosciuto.tipo_file,
  });
  if (error) return rifiuta(messaggioErroreVerifica(error.message));

  revalidatePath("/gestione");
  revalidatePath("/gestione-affitti");
  return { ok: true };
}

/**
 * Elimina un documento: solo chi lo ha caricato (lo decide il database). Il file si toglie
 * dall'archivio subito; se non riesce, c'è la coda dei file da togliere.
 */
export async function eliminaDocumento(documentoId: string): Promise<EsitoDocumento> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: messaggioErroreVerifica("NON_AUTENTICATO") };
  if (!èUuid(documentoId)) return { error: messaggioErroreVerifica("DOCUMENTO_NON_TUO") };

  const { data: percorso, error } = await supabase.rpc("elimina_documento_contratto", { p_documento: documentoId });
  if (error) return { error: messaggioErroreVerifica(error.message) };

  // subito, con i permessi di chi ha caricato (la sua cartella); poi, se c'è la chiave di servizio, anche la coda
  if (typeof percorso === "string" && percorsoDiUtente(percorso, user.id)) {
    try {
      await supabase.storage.from(BUCKET_DOCUMENTI_CONTRATTO).remove([percorso]);
    } catch {
      // resta nella coda: la riga cancellata l'ha già accodata
    }
  }
  const admin = clienteAmministratore();
  if (admin) await svuotaCodaFile(admin);

  revalidatePath("/gestione");
  revalidatePath("/gestione-affitti");
  return { ok: true };
}
