/**
 * Le decisioni del proprietario sulle candidature: accettare («Fai match»), scartare, e ANNULLARE un match o uno scarto.
 * Logica pura, senza database. Le regole vere (chi può annullare, cosa lo impedisce) stanno nella migrazione 0034; qui si
 * traducono in parole.
 */

/** Le parole per ogni errore dell'annullamento: il codice sta all'inizio del messaggio del database. */
export const ERRORI_RIAPERTURA: Readonly<Record<string, string>> = {
  NON_AUTENTICATO: "Accedi di nuovo per continuare.",
  CANDIDATURA_NON_TUA: "Non troviamo questa candidatura.",
  NON_DECISA: "Non c'è niente da annullare: questa candidatura non ha una decisione.",
  HA_UN_CONTRATTO: "C'è già un contratto: il match non si può più annullare.",
  HA_UNA_VISITA: "C'è una visita in programma: annullala prima, poi potrai annullare il match.",
};

export const ERRORE_RIAPERTURA_GENERICO = "Qualcosa non ha funzionato. Riprova tra poco.";

/** Dal messaggio del database («HA_UN_CONTRATTO: ...») alle parole per la persona; ciò che non si riconosce resta generico. */
export function messaggioErroreRiapertura(messaggio: unknown): string {
  if (typeof messaggio !== "string") return ERRORE_RIAPERTURA_GENERICO;
  const m = messaggio.match(/^([A-Z][A-Z_]+):/);
  return (m && ERRORI_RIAPERTURA[m[1]]) || ERRORE_RIAPERTURA_GENERICO;
}

/** Cosa si può fare con una candidatura, secondo il suo stato (anche quello che il proprietario ha appena cambiato). */
export type AzioniCandidatura = {
  faiMatch: boolean;
  scarta: boolean;
  apriChat: boolean;
  annullaMatch: boolean;
  annullaScarto: boolean;
};

export function azioniPerStato(stato: string): AzioniCandidatura {
  return {
    faiMatch: stato === "in_attesa",
    scarta: stato === "in_attesa",
    apriChat: stato === "accettata",
    annullaMatch: stato === "accettata",
    annullaScarto: stato === "rifiutata",
  };
}
