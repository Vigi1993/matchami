export type Ruolo = "inquilino" | "proprietario";
export type NucleoFamiliare = "single" | "coppia";

export type TenantProfile = {
  profile_id: string;
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
  budget_max: number | null;
  locali_min: number | null;
  mq_min: number | null;
  avatar_url: string | null;
};

export type StatoContratto = "bozza" | "in_firma" | "firmato" | "concluso";

export type StatoCandidatura = "in_attesa" | "accettata" | "rifiutata";

export type ListingProprietario = {
  id: string;
  titolo: string;
  zona: string;
  prezzo: number;
  pubblicato: boolean;
  nCandidature: number;
};

export type OwnerProfile = {
  profile_id: string;
  proprietario_tipo: "privato" | "agenzia" | "property_manager" | null;
  num_immobili: number;
  obiettivo: string | null;
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
  /** galleria dell'annuncio, già ordinata */
  foto: string[];
  /** cosa chiede il proprietario ai candidati, con peso e obbligatorietà */
  criteri: import("@/lib/match").CriterioRichiesto[];
  nCandidature: number;
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
