export type Ruolo = "inquilino" | "proprietario";
export type NucleoFamiliare = "single" | "coppia";

export type TenantProfile = {
  profile_id: string;
  /** `false` = l'inquilino si è nascosto ai proprietari; di partenza (e se non si sa) è visibile */
  visibile_ai_proprietari?: boolean;
  professione: string | null;
  reddito_mensile: number | null;
  /** reddito mensile di TUTTO il nucleo, chiesto esplicitamente */
  reddito_nucleo: number | null;
  garante: boolean | null;
  fideiussione: boolean | null;
  protestato: boolean | null;
  animali: boolean | null;
  nucleo: NucleoFamiliare | null;
  figli: number;
  redditi_nucleo: number;
  presentazione: string | null;
  verificato: boolean;
  verifica_stato: "non_avviata" | "in_verifica" | "verificato";
  /** perché la verifica non è riuscita, o è decaduta; lo scrive solo lo staff */
  verifica_esito_note: string | null;
  verifica_inviata_at: string | null;
  /** quando lo staff ha verificato il reddito, e quando la verifica SCADE (migrazione 0040): dopo, non vale più finché non si rinnova */
  reddito_verificato_at?: string | null;
  reddito_scade_il?: string | null;
  /** la parte del reddito del nucleo che i documenti dimostrano (la somma degli importi scritti dallo staff) */
  reddito_nucleo_verificato?: number | null;
  protesti_verificati_at?: string | null;
  protesti_scade_il?: string | null;
  /** l'ultima volta che la persona ha confermato «la mia situazione non è cambiata» */
  situazione_confermata_at?: string | null;
  /** la verifica dei protesti da parte dello staff (migrazione 0038): se «verificato», `protestato` è il valore dello staff */
  protesti_verifica_stato?: "non_avviata" | "in_verifica" | "verificato";
  protesti_verifica_esito_note?: string | null;
  budget_max: number | null;
  locali_min: number | null;
  mq_min: number | null;
  avatar_url: string | null;
};

export type StatoContratto = "bozza" | "in_firma" | "firmato" | "concluso";

export type StatoCandidatura = "in_attesa" | "accettata" | "rifiutata" | "ritirata";

export type ListingProprietario = {
  id: string;
  titolo: string;
  zona: string;
  prezzo: number;
  pubblicato: boolean;
  nCandidature: number;
};

export type ImmobileDettaglio = {
  id: string;
  titolo: string;
  descrizione: string | null;
  zona: string;
  prezzo: number;
  locali: number | null;
  mq: number | null;
  attributi: Record<string, boolean>;
  pubblicato: boolean;
  /** classe energetica (APE) e indice di prestazione: dati pubblici dell'annuncio */
  classe_energetica?: string | null;
  ep_globale?: number | null;
  /** i dati che chi cerca può filtrare (obbligatori per chiedere la verifica) */
  luogo_id?: string | null;
  tipologia?: "appartamento" | "villa" | null;
  bagni?: number | null;
  piano?: number | null;
  riscaldamento?: string | null;
  tipo_contratto?: string | null;
  disponibile_dal?: string | null;
  /** galleria dell'annuncio, già ordinata */
  foto: string[];
  /** stato della verifica dell'immobile e, se respinto, il motivo */
  verifica_stato: "non_avviata" | "in_verifica" | "verificato";
  verifica_esito_note: string | null;
  /** cosa chiede il proprietario ai candidati, con peso e obbligatorietà */
  criteri: import("@/lib/match").CriterioRichiesto[];
  nCandidature: number;
  /** quante prove di proprietà (visura, atto) ha già caricato per questo immobile */
  nProprieta?: number;
  /** le prove di proprietà già caricate, dalla più recente */
  documenti?: import("@/lib/verifica").DocumentoVerifica[];
};

export type CandidaturaSenzaContratto = {
  id: string;
  listings: { titolo: string; zona: string } | null;
  nome: string | null;
  cognome: string | null;
};

export type ContrattoProprietario = {
  id: string;
  stato: StatoContratto;
  canone: number | null;
  durata_mesi: number | null;
  data_inizio: string | null;
  data_firma: string | null;
  /** la risposta dell'inquilino quando il contratto è firmato: ha confermato che l'affitto è cominciato, o ha detto che non è corretto */
  inquilino_conferma_at?: string | null;
  inquilino_rifiuta_at?: string | null;
  candidature: {
    listings: { titolo: string; zona: string } | null;
    tenant_id: string;
  } | null;
  nome?: string | null;
  cognome?: string | null;
};

export type Messaggio = {
  id: string;
  mittente_id: string;
  testo: string;
  created_at: string;
};

export type CandidaturaRicevuta = {
  id: string;
  status: StatoCandidatura;
  /** compatibilità vista dall'INQUILINO al momento della candidatura: il
   *  proprietario non la usa, vede la propria in `valutazione` */
  match_pct: number | null;
  created_at: string;
  tenant_id: string;
  listing_id: string;
  listings: { titolo: string; zona: string; prezzo: number } | null;
  tenant_profiles: {
    professione: string | null;
    reddito_mensile: number | null;
    reddito_nucleo: number | null;
    verificato: boolean;
    /** lo staff ha verificato i protesti E la verifica vale ancora */
    protesti_verificati?: boolean;
    /** c'era una verifica del reddito ma è scaduta (migrazione 0040) */
    reddito_scaduto?: boolean;
    reddito_verificato_at?: string | null;
    /** la parte del reddito del nucleo documentata dallo staff */
    reddito_nucleo_verificato?: number | null;
    protesti_scaduti?: boolean;
    protesti_verificati_at?: string | null;
    situazione_confermata_at?: string | null;
    /** la risposta sui protesti (se verificati, quella dello staff) */
    protestato?: boolean | null;
    presentazione: string | null;
    avatar_url: string | null;
  } | null;
  // aggiunto lato server dopo il fetch separato di profiles
  nome?: string | null;
  cognome?: string | null;
  /** il match visto dal proprietario sui criteri che ha chiesto, e
   *  l'affidabilità accanto. `congelata`: fotografia scattata alla decisione. */
  valutazione?: import("@/lib/match").ValutazioneCandidato & {
    congelata: boolean;
  };
};

export type CandidaturaConAnnuncio = {
  id: string;
  status: StatoCandidatura;
  match_pct: number | null;
  /** chiave della lista chiusa in lib/motivi-rifiuto.ts; null se non rifiutata o rifiutata prima che esistesse */
  motivo_rifiuto: string | null;
  /** chi ha cominciato: l'inquilino che si candida, o il proprietario con una richiesta accettata */
  origine?: "inquilino" | "proprietario";
  created_at: string;
  listings: {
    titolo: string;
    zona: string;
    prezzo: number;
    locali: number | null;
    mq: number | null;
  } | null;
};

export type ListingConFoto = {
  id: string;
  titolo: string;
  zona: string;
  prezzo: number;
  locali: number | null;
  mq: number | null;
  descrizione: string | null;
  /** caratteristiche dell'immobile, chiavi di ATTR_VOCAB */
  attributi: Record<string, boolean> | null;
  classe_energetica?: string | null;
  ep_globale?: number | null;
  listing_photos: { url: string; ordine: number }[];
};

/** Un annuncio del mazzo, con il calcolo di quanto va bene a questo inquilino. */
export type ListingConMatch = ListingConFoto & {
  match: import("@/lib/match").RisultatoInquilino;
};

export type ContrattoConAnnuncio = {
  id: string;
  stato: StatoContratto;
  canone: number | null;
  durata_mesi: number | null;
  data_inizio: string | null;
  data_firma: string | null;
  inquilino_conferma_at?: string | null;
  inquilino_rifiuta_at?: string | null;
  candidature: {
    listings: { titolo: string; zona: string } | null;
  } | null;
};

/** Invito mandato da un inquilino al proprio proprietario. */
export type Invito = {
  id: string;
  token: string;
  nome_proprietario: string;
  email_proprietario: string | null;
  indirizzo: string | null;
  periodo: string | null;
  stato: "inviato" | "completato" | "annullato";
  created_at: string;
};
