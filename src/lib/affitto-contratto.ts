/**
 * L'affitto che nasce da un contratto fatto su MatchAmI: il proprietario segna il contratto «firmato», l'INQUILINO conferma con un tocco
 * che l'affitto è davvero cominciato (o dice che non è corretto), poi una delle due parti carica una copia del contratto per lo staff.
 * Logica pura, senza database: si prova con `npm test`. Le regole vere stanno nella migrazione 0035.
 */

/** Le parole per ogni errore che il database può restituire: il codice sta all'inizio del messaggio. */
export const ERRORI_AFFITTO: Readonly<Record<string, string>> = {
  NON_AUTENTICATO: "Accedi di nuovo per continuare.",
  RISPOSTA_NON_VALIDA: "Rispondi sì o no.",
  CONTRATTO_NON_TUO: "Non troviamo questo contratto.",
  CONTRATTO_NON_FIRMATO: "Il contratto non è ancora firmato: potrai rispondere quando lo sarà.",
  GIA_RISPOSTO: "Hai già risposto per questo contratto.",
  DATI_MANCANTI: "Nel contratto manca la data di inizio: chiedi al proprietario di completarlo.",
  AFFITTO_NON_ANCORA_INIZIATO: "L'affitto non è ancora cominciato: potrai confermarlo dal giorno di inizio.",
  RAPPORTO_NON_TUO: "Non troviamo questo affitto.",
  NON_DA_CONTRATTO: "Questo affitto ha già il suo contratto.",
  GIA_VERIFICATO: "L'affitto è già stato verificato: il documento non si cambia.",
  PERCORSO_NON_VALIDO: "Il file non è valido. Riprova.",
  FILE_NON_TROVATO: "Non siamo riusciti a leggere il file caricato. Riprova.",
  RISPOSTA_RISERVATA: "La risposta sull'affitto la dà solo l'inquilino.",
};

export const ERRORE_AFFITTO_GENERICO = "Qualcosa non ha funzionato. Riprova tra poco.";

/** Dal messaggio del database («GIA_RISPOSTO: ...») alle parole per la persona; ciò che non si riconosce resta generico. */
export function messaggioErroreAffitto(messaggio: unknown): string {
  if (typeof messaggio !== "string") return ERRORE_AFFITTO_GENERICO;
  const m = messaggio.match(/^([A-Z][A-Z_]+):/);
  return (m && ERRORI_AFFITTO[m[1]]) || ERRORE_AFFITTO_GENERICO;
}

type ContrattoConRisposta = {
  stato: string;
  inquilino_conferma_at?: string | null;
  inquilino_rifiuta_at?: string | null;
};

/** Il contratto è firmato (o concluso): da qui l'inquilino può rispondere. */
export const statoPermetteRisposta = (stato: unknown): boolean => stato === "firmato" || stato === "concluso";

/** L'inquilino deve ancora dire se l'affitto è cominciato. */
export function daConfermare(c: ContrattoConRisposta | null | undefined): boolean {
  if (!c || !statoPermetteRisposta(c.stato)) return false;
  return !c.inquilino_conferma_at && !c.inquilino_rifiuta_at;
}

export type RispostaInquilino = "non_firmato" | "da_dare" | "confermato" | "non_corretto";

export function rispostaInquilino(c: ContrattoConRisposta | null | undefined): RispostaInquilino {
  if (!c || !statoPermetteRisposta(c.stato)) return "non_firmato";
  if (c.inquilino_conferma_at) return "confermato";
  if (c.inquilino_rifiuta_at) return "non_corretto";
  return "da_dare";
}

/** Cosa dire al PROPRIETARIO sul contratto: `null` finché il contratto non è firmato. */
export function statoPerProprietario(c: ContrattoConRisposta | null | undefined): { chiave: Exclude<RispostaInquilino, "non_firmato">; testo: string } | null {
  const r = rispostaInquilino(c);
  if (r === "non_firmato") return null;
  if (r === "confermato") return { chiave: r, testo: "L'inquilino ha confermato l'affitto. Carica una copia del contratto per farlo verificare." };
  if (r === "non_corretto") return { chiave: r, testo: "L'inquilino ha detto che c'è qualcosa che non va: correggi i dati del contratto e gli verrà chiesto di nuovo." };
  return { chiave: r, testo: "In attesa che l'inquilino confermi l'affitto." };
}

/** Le frasi della carta di conferma dell'inquilino. */
export const TESTI_CONFERMA_AFFITTO = {
  titolo: "Confermi che l'affitto è cominciato?",
  spiegazione:
    "Il proprietario ha segnato il contratto come firmato. Se è tutto giusto, conferma: dopo il controllo di una copia del contratto da parte del nostro team l'affitto varrà per i feedback.",
  si: "Sì, è tutto corretto",
  no: "No, c'è qualcosa che non va",
  grazie: "Grazie! Ora carica una copia del contratto registrato in «Affitti e recensioni»: serve al nostro team per verificare l'affitto.",
  rifiutato: "Va bene: abbiamo avvisato il proprietario. Se corregge i dati del contratto ti chiederemo di nuovo.",
} as const;

/** Il testo del pulsante per caricare il documento di un affitto nato da un contratto, e cosa serve. */
export const TESTI_CARICA_CONTRATTO = {
  titolo: "Carica una copia del contratto",
  spiegazione: "Il contratto registrato, in PDF o foto: lo vede solo il nostro team, non l'altra persona. Serve a verificare l'affitto.",
  pulsante: "Carica il contratto",
} as const;
