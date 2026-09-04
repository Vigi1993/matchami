export type Ruolo = "inquilino" | "proprietario";
export type NucleoFamiliare = "single" | "coppia";

export type TenantProfile = {
  profile_id: string;
  professione: string | null;
  reddito_mensile: number | null;
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
  fotoUrl: string | null;
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

export type CandidaturaRicevuta = {
  id: string;
  status: StatoCandidatura;
  match_pct: number | null;
  created_at: string;
  tenant_id: string;
  listings: { titolo: string; zona: string } | null;
  tenant_profiles: {
    professione: string | null;
    reddito_mensile: number | null;
    verificato: boolean;
    presentazione: string | null;
  } | null;
  // aggiunto lato client dopo il fetch separato di profiles
  nome?: string | null;
  cognome?: string | null;
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
  listing_photos: { url: string }[];
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
