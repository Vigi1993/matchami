/**
 * Verifica degli immobili: la parte che non dipende dalla rete.
 *
 * Le regole vere stanno nel database (migrazione 0012). Qui si decide cosa
 * mostrare, cosa mancherebbe, e si controlla un file PRIMA di caricarlo,
 * per dire subito alla persona cosa non va.
 */

export type StatoImmobile = "non_avviata" | "in_verifica" | "verificato";

export type ImmobileVerifica = {
  id: string;
  titolo: string;
  zona: string;
  stato: StatoImmobile;
  /** il motivo dell'ultimo rifiuto, se c'è */
  note: string | null;
  /** quante prove di proprietà ha già caricato per questo immobile */
  nProprieta: number;
};

export type DescrizioneStato = {
  etichetta: string;
  tono: "ok" | "attesa" | "da_fare" | "respinto";
  testo: string;
};

export function descriviStato(stato: StatoImmobile, note: string | null): DescrizioneStato {
  if (stato === "verificato") {
    return {
      etichetta: "Verificato",
      tono: "ok",
      testo: "L'immobile è verificato: gli inquilini lo vedono se è pubblicato.",
    };
  }
  if (stato === "in_verifica") {
    return {
      etichetta: "In verifica",
      tono: "attesa",
      testo: "Stiamo controllando i documenti. Troverai qui l'esito.",
    };
  }
  if (note && note.trim()) {
    return {
      etichetta: "Da correggere",
      tono: "respinto",
      testo: "La verifica non è andata a buon fine. Correggi e invia di nuovo.",
    };
  }
  return {
    etichetta: "Da verificare",
    tono: "da_fare",
    testo: "Carica i documenti e invia l'immobile per la verifica.",
  };
}

/** Cosa manca perché un immobile si possa inviare alla verifica. */
export function cosaManca(haIdentita: boolean, immobile: ImmobileVerifica): string[] {
  const manca: string[] = [];
  if (!haIdentita) manca.push("il tuo documento d'identità");
  if (immobile.nProprieta === 0) manca.push("una prova di proprietà dell'immobile (visura o atto)");
  return manca;
}

export function puoInviare(haIdentita: boolean, immobile: ImmobileVerifica): boolean {
  return immobile.stato === "non_avviata" && cosaManca(haIdentita, immobile).length === 0;
}

/** Il proprietario è verificato se ha almeno un immobile verificato. */
export function proprietarioVerificato(immobili: ImmobileVerifica[]): boolean {
  return immobili.some((i) => i.stato === "verificato");
}

// ------------------------------------------------------------
// File
// ------------------------------------------------------------

export const TIPI_FILE_AMMESSI = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
} as const;

export const DIMENSIONE_MAX_BYTE = 10 * 1024 * 1024; // 10 MB, come il limite del bucket

/**
 * `hasOwnProperty` e non `in`: con `in`, un tipo dichiarato "constructor" o
 * "toString" risulterebbe tra quelli ammessi, perché sono proprietà che ogni
 * oggetto eredita.
 */
function tipoAmmesso(tipo: string): boolean {
  return Object.prototype.hasOwnProperty.call(TIPI_FILE_AMMESSI, tipo);
}

/** Controlla un file prima di caricarlo. Restituisce il messaggio, o `null` se va bene. */
export function validaFileDocumento(file: { type: string; size: number }): string | null {
  if (!tipoAmmesso(file.type)) {
    return "Il file deve essere un PDF, una foto JPG o una foto PNG.";
  }
  if (file.size <= 0) return "Il file è vuoto.";
  if (file.size > DIMENSIONE_MAX_BYTE) {
    return "Il file supera i 10 MB. Riducilo o scansionalo a una risoluzione più bassa.";
  }
  return null;
}

/** L'estensione si ricava dal tipo dichiarato, non dal nome: il nome lo sceglie chi carica. */
export function estensioneDa(tipo: string): string | null {
  return tipoAmmesso(tipo)
    ? (TIPI_FILE_AMMESSI as Record<string, string>)[tipo]
    : null;
}

/**
 * Il percorso di un documento nel bucket. Comincia SEMPRE con l'id di chi
 * carica: è la condizione che il database richiede, e quella che tiene i
 * documenti di una persona in una cartella sua.
 */
export function percorsoDocumento(input: {
  userId: string;
  tipo: "identita" | "proprieta" | "contratto";
  listingId: string | null;
  estensione: string;
  id: string;
}): string {
  const pulito = (s: string) => s.replace(/[^a-zA-Z0-9-]/g, "");
  // Il contratto si chiama "contratto-...": è ciò che la funzione del database
  // `crea_richiesta_rapporto` richiede, e impedisce di presentare come
  // contratto un altro file della propria cartella.
  const base =
    input.tipo === "identita"
      ? "identita"
      : input.tipo === "contratto"
        ? "contratto"
        : `proprieta-${pulito(input.listingId ?? "")}`;
  return `${pulito(input.userId)}/${base}-${pulito(input.id)}.${pulito(input.estensione)}`;
}

// ------------------------------------------------------------
// Errori
// ------------------------------------------------------------

const MESSAGGI: Record<string, string> = {
  NON_AUTENTICATO: "Devi accedere per continuare.",
  IMMOBILE_NON_TUO: "Questo immobile non risulta tuo.",
  GIA_VERIFICATO: "Questo immobile è già verificato.",
  GIA_IN_VERIFICA: "Questo immobile è già in verifica.",
  DOCUMENTI_MANCANTI:
    "Mancano dei documenti: servono il tuo documento d'identità e una prova di proprietà dell'immobile.",
  NON_STAFF: "Non hai i permessi per farlo.",
  NON_IN_VERIFICA: "Questo immobile non è in attesa di verifica.",
  NOTA_OBBLIGATORIA: "Per respingere scrivi cosa non va: il proprietario la leggerà.",
  IMMOBILE_INESISTENTE: "Immobile non trovato.",
  // rapporti di locazione
  RAPPORTO_INESISTENTE: "Affitto non trovato.",
  INDIRIZZO_NON_VALIDO: "Scrivi l'indirizzo dell'immobile, in poche parole.",
  PERIODO_NON_VALIDO:
    "Il periodo non è valido: l'affitto deve essere già cominciato e la fine non può precedere l'inizio.",
  PERCORSO_NON_VALIDO: "Il file del contratto non è valido. Caricalo di nuovo.",
  FILE_NON_TROVATO: "Il contratto non risulta caricato. Caricalo di nuovo.",
  TROPPE_RICHIESTE:
    "Hai già molte richieste senza risposta. Aspetta che qualcuna venga confermata o ritirane qualcuna.",
  RICHIESTA_INESISTENTE: "Questo link non è valido.",
  RICHIESTA_GIA_RISPOSTA: "A questa richiesta è già stata data una risposta.",
  RICHIESTA_SCADUTA: "Questa richiesta è scaduta. Chiedi di crearne una nuova.",
  RICHIESTA_TUA: "Questa è una richiesta che hai creato tu: la conferma spetta all'altra persona.",
  STESSO_RUOLO:
    "Per rispondere serve un account di tipo diverso da chi ha creato la richiesta: se l'ha creata un inquilino risponde un proprietario, e viceversa.",
  RAPPORTO_ESISTENTE: "Questo affitto risulta già dichiarato tra voi due.",
  // feedback
  RAPPORTO_NON_TUO: "Questo affitto non risulta tuo.",
  VOTO_NON_VALIDO: "Scegli un voto da 1 a 5.",
  TAG_NON_VALIDI: "Una delle qualità scelte non è valida. Ricarica la pagina e riprova.",
  PROPRIETARIO_NON_VERIFICATO:
    "Per lasciare un feedback serve un tuo immobile verificato su MatchAmI.",
  RAPPORTO_NON_VERIFICATO:
    "Per lasciare un feedback l'affitto deve essere verificato: lo controlliamo noi.",
  RAPPORTO_GIA_RECENSITO: "Hai già lasciato il feedback per questo affitto.",
};

/** Traduce gli errori del database in frasi comprensibili. Mai il testo tecnico. */
export function messaggioErroreVerifica(errore: string | null | undefined): string {
  const e = errore ?? "";
  const chiave = Object.keys(MESSAGGI).find((k) => e.includes(k));
  return chiave ? MESSAGGI[chiave] : "Non è stato possibile completare l'operazione. Riprova.";
}
