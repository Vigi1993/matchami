/**
 * La coda dei file da togliere dall'archivio.
 *
 * Quando una riga di documento sparisce (anche a cascata: un contratto cancellato, un account eliminato)
 * il database mette il percorso del file in una coda, perché i file nell'archivio NON si cancellano
 * da soli. Qui la si svuota: si tolgono i file e SOLO dopo si cancellano le righe della coda. Se
 * qualcosa va storto la riga resta, e il giro dopo riprova. Non lancia mai errori.
 *
 * SOLO codice del server: serve la chiave di servizio.
 */

/** Ciò che serve della libreria: permette di provarla con un finto. */
export type AdminArchivio = {
  rpc(
    nome: string,
    args?: Record<string, unknown>
  ): PromiseLike<{ data: unknown; error: { message: string } | null }>;
  storage: {
    from(bucket: string): {
      remove(percorsi: string[]): Promise<{ error: { message: string } | null }>;
    };
  };
};

export type RiepilogoCoda = { letti: number; rimossi: number; errori: number };

export const MASSIMO_PER_GIRO = 100;

export async function svuotaCodaFile(admin: AdminArchivio, max: number = MASSIMO_PER_GIRO): Promise<RiepilogoCoda> {
  const esito: RiepilogoCoda = { letti: 0, rimossi: 0, errori: 0 };
  try {
    const { data, error } = await admin.rpc("file_da_eliminare_elenco", { p_max: max });
    if (error || !Array.isArray(data)) return { ...esito, errori: 1 };

    const righe = data as { id: string; bucket: string; percorso: string }[];
    esito.letti = righe.length;

    const perBucket = new Map<string, { id: string; percorso: string }[]>();
    for (const r of righe) {
      if (!r || typeof r.bucket !== "string" || typeof r.percorso !== "string" || typeof r.id !== "string") continue;
      (perBucket.get(r.bucket) ?? perBucket.set(r.bucket, []).get(r.bucket)!).push(r);
    }

    const finiti: string[] = [];
    for (const [bucket, elenco] of perBucket) {
      try {
        const { error: e } = await admin.storage.from(bucket).remove(elenco.map((r) => r.percorso));
        if (e) esito.errori++;
        else finiti.push(...elenco.map((r) => r.id));
      } catch {
        esito.errori++;
      }
    }

    if (finiti.length > 0) {
      const { error: e } = await admin.rpc("file_eliminati", { p_ids: finiti });
      if (e) esito.errori++;
      else esito.rimossi = finiti.length;
    }
  } catch {
    esito.errori++;
  }
  return esito;
}
