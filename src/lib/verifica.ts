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
  tipo: "identita" | "proprieta" | "contratto" | "inquilino-identita" | "inquilino-reddito";
  listingId: string | null;
  estensione: string;
  id: string;
}): string {
  const pulito = (s: string) => s.replace(/[^a-zA-Z0-9-]/g, "");
  // Il contratto si chiama "contratto-...": è ciò che la funzione del database
  // `crea_richiesta_rapporto` richiede, e impedisce di presentare come
  // contratto un altro file della propria cartella.
  // I documenti dell'inquilino si chiamano "inquilino-identita-..." e
  // "inquilino-reddito-...": è ciò che il database richiede per registrarli,
  // e ciò che permette di toglierli prima dell'invio senza toccare i contratti.
  const base =
    input.tipo === "identita" || input.tipo === "contratto"
      ? input.tipo
      : input.tipo === "inquilino-identita" || input.tipo === "inquilino-reddito"
        ? input.tipo
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
  // verifica del reddito dell'inquilino
  NON_INQUILINO: "Solo gli inquilini possono verificare il reddito.",
  INQUILINO_GIA_VERIFICATO: "Il tuo reddito risulta già verificato.",
  INQUILINO_GIA_IN_VERIFICA: "La tua richiesta è già in verifica.",
  DOCUMENTI_INQUILINO_MANCANTI:
    "Mancano dei documenti: servono un documento d'identità e una prova del reddito.",
  DATI_PROFILO_MANCANTI:
    "Prima completa il tuo profilo: indica il lavoro e il reddito mensile, così possiamo confrontarli con i documenti.",
  INQUILINO_NON_IN_VERIFICA: "Questa persona non ha una verifica in attesa.",
  INQUILINO_NOTA_OBBLIGATORIA: "Per respingere scrivi cosa non va: la persona la leggerà.",
  INQUILINO_INESISTENTE: "Inquilino non trovato.",
  // decisioni sulle candidature
  CANDIDATURA_NON_TUA: "Questa candidatura non risulta tua.",
  // indirizzo degli immobili
  INDIRIZZO_IMMOBILE_NON_VALIDO: "Controlla l'indirizzo: servono la via, il numero civico e il CAP di cinque cifre.",
  POSIZIONE_NON_VALIDA: "Non è stato possibile calcolare la posizione sulla mappa. Controlla l'indirizzo.",
  ORIGINE_NON_VALIDA: "Non è stato possibile salvare la posizione sulla mappa.",
  // preferiti e scarti
  SOLO_INQUILINI: "Solo chi cerca casa può salvare o scartare gli annunci.",
  ANNUNCIO_NON_DISPONIBILE: "Questo annuncio non è più disponibile.",
  GIA_CANDIDATO: "Hai già inviato la candidatura per questo annuncio.",
  TROPPI_PREFERITI: "Hai già 100 preferiti: togline qualcuno per salvarne un altro.",
  // visite
  DATA_NON_VALIDA: "Scegli una data e un'ora valide.",
  DATA_TROPPO_VICINA: "Il posto deve essere tra almeno un'ora.",
  DATA_TROPPO_LONTANA: "Il posto deve essere entro 90 giorni.",
  TROPPI_POSTI: "Hai già 30 posti liberi su questo immobile: toglierne uno, o aspetta che qualcuno prenoti.",
  POSTO_TROPPO_VICINO: "Tra due visite sullo stesso immobile servono almeno 30 minuti.",
  VISITA_NON_TUA: "Questa visita non risulta tua.",
  VISITA_PRENOTATA: "Questo posto è già stato prenotato: per toglierlo, annulla la visita.",
  VISITA_NON_DISPONIBILE: "Questo posto non è più disponibile. Scegline un altro.",
  VISITA_GIA_PRENOTATA: "Hai già una visita prenotata: annullala se vuoi sceglierne un'altra.",
  VISITA_NON_ANNULLABILE: "Questa visita non si può annullare.",
  VISITA_GIA_PASSATA: "Questa visita è già passata.",
  CANDIDATURA_NON_ACCETTATA: "Puoi prenotare una visita solo dopo che il proprietario ha accettato la tua candidatura.",
  CONVERSAZIONE_NON_TUA: "Questa conversazione non è tua.",
  CANDIDATURA_RITIRATA: "La persona ha ritirato la candidatura: non c'è più nulla da valutare.",
  CANDIDATURA_NON_RITIRABILE:
    "Questa candidatura non si può più ritirare: il proprietario l'ha già valutata.",
  CANDIDATURA_GIA_VALUTATA: "Questa candidatura è già stata valutata.",
  MOTIVO_OBBLIGATORIO: "Scegli un motivo per il rifiuto.",
  STATO_NON_VALIDO: "Scelta non valida.",
};

/** Traduce gli errori del database in frasi comprensibili. Mai il testo tecnico. */
export function messaggioErroreVerifica(errore: string | null | undefined): string {
  const e = errore ?? "";
  // Più codici possono comparire nello stesso testo (uno contiene l'altro:
  // INQUILINO_GIA_VERIFICATO contiene GIA_VERIFICATO): vince il più lungo, cioè
  // il più specifico. Altrimenti all'inquilino toccherebbe la frase
  // dell'immobile.
  const chiave = Object.keys(MESSAGGI)
    .filter((k) => e.includes(k))
    .sort((a, b) => b.length - a.length)[0];
  return chiave ? MESSAGGI[chiave] : "Non è stato possibile completare l'operazione. Riprova.";
}
