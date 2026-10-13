/** Tipi condivisi dai due lati del calcolo. Nessuna dipendenza dal database. */

export type StatoCriterio = "ok" | "no" | "non_indicato";

/** Una riga della spiegazione: "perché vedi questo numero" (P6). */
export type VoceCriterio = {
  chiave: string;
  etichetta: string;
  stato: StatoCriterio;
  /** testo breve, es. "€1.420 contro un budget di €1.500" */
  dettaglio?: string;
  /** lato proprietario: il criterio era obbligatorio */
  obbligatorio?: boolean;
};

export type EtichettaMatch =
  | "Ottima compatibilità"
  | "Buona compatibilità"
  | "Compatibilità parziale"
  | "Compatibilità bassa";

// ------------------------------------------------------------
// Inquilino → casa
// ------------------------------------------------------------

export type Tipologia = "appartamento" | "villa" | "posto_letto";

/** Le caratteristiche che hanno un VALORE (le altre sono sì/no). */
export type ChiaveConValore = "bagni" | "piano" | "riscaldamento" | "contratto" | "ingresso" | "classeEnergetica";

/** Il valore di un criterio: quale campo serve dipende dalla chiave (vedi criteri-ricerca.ts). */
export type ValoreCriterio = {
  min?: number | null;
  max?: number | null;
  tipi?: string[];
  /** data, AAAA-MM-GG */
  entro?: string;
  classe?: string;
};

/**
 * Una caratteristica cercata. `necessaria`: se la casa non la rispetta SPARISCE dal mazzo. Altrimenti è
 * `opzionale` e pesa sul punteggio (`peso` da 1 a 10).
 */
export type CriterioRicerca = {
  chiave: string;
  necessaria: boolean;
  peso: number;
  valore: ValoreCriterio | null;
};

/** I criteri di ricerca dell'inquilino. `null` = nessuna preferenza. */
export type ProfiloRicerca = {
  budgetMax: number | null;
  localiMin: number | null;
  mqMin: number | null;
  /** vuoto = nessuna preferenza di zona (le etichette, es. «Isola, Milano») */
  zone: string[];
  /** chiave caratteristica → peso da 1 a 10 (le sole opzionali sì/no: serve a chi non conosce i criteri nuovi) */
  interessi: Record<string, number>;

  // ---- parametri aggiunti: tutti facoltativi, chi non li conosce non cambia comportamento ----
  budgetMin?: number | null;
  localiMax?: number | null;
  mqMax?: number | null;
  /** cosa si cerca; senza valore = nessun filtro */
  tipologia?: Tipologia | null;
  /** i luoghi scelti (provincia, città o quartiere): gli identificativi */
  luoghi?: string[];
  /** tutte le caratteristiche, necessarie e opzionali. Se c'è, `interessi` non si legge */
  criteri?: CriterioRicerca[];
};

export type AnnuncioPerMatch = {
  prezzo: number;
  zona: string;
  locali: number | null;
  mq: number | null;
  attributi: Record<string, boolean> | null;

  // ---- dati aggiunti: tutti facoltativi ----
  tipologia?: Tipologia | null;
  /** l'identificativo del luogo dell'annuncio e di tutti quelli che lo contengono (quartiere, città, provincia) */
  antenati?: string[];
  bagni?: number | null;
  /** 0 = piano terra, -1 = seminterrato */
  piano?: number | null;
  riscaldamento?: string | null;
  tipoContratto?: string | null;
  /** data, AAAA-MM-GG */
  disponibileDal?: string | null;
  classeEnergetica?: string | null;
};

/** Perché una casa non compare nel mazzo. */
export type MotivoEsclusione = "budget" | "tipologia" | "necessaria";

/**
 * - `in_ricerca`: rispetta tutti i criteri.
 * - `oltre_ricerca`: sfora il budget entro la tolleranza, o non rispetta
 *   zona, locali o metratura. Compare dopo gli altri, marcato.
 * - `escluso`: sfora il budget oltre la tolleranza. Non compare.
 */
export type Fascia = "in_ricerca" | "oltre_ricerca" | "escluso";

export type RisultatoInquilino = {
  /** 0-99 */
  punteggio: number;
  etichetta: EtichettaMatch;
  fascia: Fascia;
  /** di quanto il canone supera il budget, in % arrotondata; `null` se non lo supera */
  sforoBudgetPct: number | null;
  criteri: VoceCriterio[];
  /**
   * Perché l'annuncio è `oltre_ricerca`, in frasi per l'interfaccia
   * (es. "Oltre il tuo budget del 6%"). Vuoto se è `in_ricerca`.
   */
  motivi: string[];
  /** Dati che mancano nell'annuncio e rendono il punteggio meno preciso. */
  avvisi: string[];
  /** Se la fascia è `escluso`: per quali ragioni (può essere più d'una). Vuoto altrimenti. */
  motiviEsclusione: MotivoEsclusione[];
};

// ------------------------------------------------------------
// Candidato → criteri del proprietario
// ------------------------------------------------------------

/**
 * I criteri che un proprietario può chiedere. Sono cinque al lancio (D5):
 * nessuno riguarda la composizione familiare, e quello sugli animali
 * resta fuori finché non lo valuta un legale.
 */
export type ChiaveCriterio =
  | "redditoCanone"
  | "garante"
  | "profiloVerificato"
  | "profiloCompleto"
  | "nessunProtesto";

/**
 * Un criterio richiesto dal proprietario per un annuncio.
 * - `preferenziale`: fa salire o scendere la percentuale.
 * - `obbligatorio`: oltre a pesare, se manca il candidato risulta
 *   "bloccato".
 */
export type CriterioRichiesto = {
  chiave: ChiaveCriterio;
  /** da 1 a 10 */
  peso: number;
  modo: "obbligatorio" | "preferenziale";
  /** solo per `redditoCanone`: il canone non supera questa % del reddito */
  sogliaPct?: number;
};

/** Cosa si sa del candidato. `null` = non indicato. */
export type DatiCandidato = {
  /** reddito mensile del NUCLEO, non della sola persona (D6) */
  redditoMensileNucleo: number | null;
  garante: boolean | null;
  fideiussione: boolean | null;
  verificato: boolean;
  /** percentuale di completezza del profilo, 0-100 */
  completezza: number;
  protestato: boolean | null;
};

export type RisultatoProprietario = {
  /** 0-99, oppure `null` se il proprietario non ha chiesto nessun criterio */
  punteggio: number | null;
  etichetta: EtichettaMatch | null;
  /** manca almeno un criterio obbligatorio */
  bloccato: boolean;
  /** etichette dei criteri obbligatori non soddisfatti */
  mancanti: string[];
  criteri: VoceCriterio[];
  /** almeno un dato non è stato indicato dal candidato */
  incompleto: boolean;
};
