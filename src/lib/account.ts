/**
 * Cancellazione dell'account: le parti che non dipendono dalla rete.
 */

/** Cosa scrivere per confermare. Si accetta anche in minuscolo. */
export const CONFERMA_ELIMINAZIONE = "ELIMINA";

export function confermaEliminazioneValida(testo: string): boolean {
  return testo.trim().toUpperCase() === CONFERMA_ELIMINAZIONE;
}

/**
 * I bucket di Storage che contengono file di una persona, ciascuno con una
 * cartella che porta il suo id: "<id utente>/<file>".
 *
 * ATTENZIONE: quando si crea un nuovo bucket per file personali (documenti
 * d'identità, buste paga, contratti...) va aggiunto QUI. Un test legge le
 * migrazioni e fallisce se un bucket creato lì non è in questa lista,
 * perché i file nello Storage NON si cancellano insieme all'utente: restano
 * lì, orfani, e sono dati personali di chi ha chiesto di essere cancellato.
 */
export const BUCKET_FILE_UTENTE = [
  "avatar-inquilini",
  "immobili-foto",
  "documenti-verifica",
] as const;

/** La parte della libreria di Storage che serve qui: permette di provarla con un finto. */
export type StorageAmministratore = {
  storage: {
    from(bucket: string): {
      list(
        cartella: string,
        opzioni?: { limit?: number }
      ): Promise<{ data: { name: string }[] | null; error: { message: string } | null }>;
      remove(
        percorsi: string[]
      ): Promise<{ error: { message: string } | null }>;
    };
  };
};

// Un utente con più di 50.000 file non è realistico: il limite evita solo
// che un errore dello Storage trasformi il ciclo in uno senza fine.
const MAX_GIRI = 50;

/**
 * Toglie dallo Storage tutti i file di una persona. Restituisce il
 * messaggio d'errore, oppure `null` se è andato tutto bene.
 *
 * Va chiamata PRIMA di cancellare l'utente: se fallisce, l'account non
 * viene toccato e la persona può riprovare. Il contrario lascerebbe file
 * personali senza più un proprietario a cui ricondurli.
 */
export async function eliminaFileUtente(
  admin: StorageAmministratore,
  idUtente: string,
  bucket: readonly string[] = BUCKET_FILE_UTENTE
): Promise<string | null> {
  for (const nome of bucket) {
    const contenitore = admin.storage.from(nome);

    for (let giro = 0; giro < MAX_GIRI; giro++) {
      const { data, error } = await contenitore.list(idUtente, { limit: 1000 });
      if (error) return `Non riesco a leggere i tuoi file (${nome}). Riprova tra poco.`;

      const nomi = (data ?? []).map((f) => f.name).filter(Boolean);
      if (nomi.length === 0) break;

      const { error: eRimozione } = await contenitore.remove(
        nomi.map((n) => `${idUtente}/${n}`)
      );
      if (eRimozione) return `Non riesco a eliminare i tuoi file (${nome}). Riprova tra poco.`;
    }
  }
  return null;
}
