import { riepilogoRecensioni, statoRaccomandazione, type RecensioneGrezza } from "./recensioni";
import { leggiFotografia, valutaCandidato } from "@/lib/match";
import type { CriterioRichiesto, ProfiloCandidato } from "@/lib/match";
import type { CandidaturaRicevuta } from "@/lib/types";

import { leggiVerificheVista } from "./scadenze-verifiche";
/** Una riga della tabella `candidature`, come la legge il proprietario. */
export type RigaCandidatura = {
  id: string;
  status: CandidaturaRicevuta["status"];
  match_pct: number | null;
  created_at: string;
  tenant_id: string;
  listing_id: string;
  listings: { titolo: string; zona: string; prezzo: number } | null;
};

/**
 * Una riga della vista `candidati_del_proprietario`. Dopo un rifiuto tutto
 * tranne nome e cognome arriva vuoto: la vista lo decide, non questo codice.
 */
export type RigaVistaCandidato = {
  candidatura_id: string;
  nome: string | null;
  cognome: string | null;
  professione: string | null;
  reddito_mensile: number | null;
  reddito_nucleo: number | null;
  garante: boolean | null;
  fideiussione: boolean | null;
  protestato: boolean | null;
  verificato: boolean | null;
  presentazione: string | null;
  avatar_url: string | null;
  animali_compilato: boolean | null;
  nucleo_compilato: boolean | null;
  /** lo staff ha verificato i protesti sul certificato E la verifica vale ancora: `protestato` è il risultato dello staff */
  protesti_verificati: boolean | null;
  /** (migrazione 0040) la verifica del reddito c'era ma è scaduta; quando è stata fatta; quanto del reddito del nucleo è documentato */
  reddito_scaduto?: boolean | null;
  reddito_verificato_at?: string | null;
  reddito_nucleo_verificato?: number | null;
  protesti_scaduti?: boolean | null;
  protesti_verificati_at?: string | null;
  situazione_confermata_at?: string | null;
};

/** Le colonne da chiedere alla vista, in un posto solo. */
export const COLONNE_VISTA_CANDIDATI =
  "candidatura_id, nome, cognome, professione, reddito_mensile, reddito_nucleo, garante, fideiussione, protestato, verificato, presentazione, avatar_url, animali_compilato, nucleo_compilato, protesti_verificati, reddito_scaduto, reddito_verificato_at, reddito_nucleo_verificato, protesti_scaduti, protesti_verificati_at, situazione_confermata_at";

/** Dalla riga della vista al profilo che legge il calcolo del match. */
export function profiloDaVista(v: Partial<RigaVistaCandidato> | null | undefined): ProfiloCandidato {
  const ver = leggiVerificheVista(v);
  return {
    professione: v?.professione ?? null,
    reddito_mensile: v?.reddito_mensile ?? null,
    reddito_nucleo: v?.reddito_nucleo ?? null,
    garante: v?.garante ?? null,
    fideiussione: v?.fideiussione ?? null,
    protestato: v?.protestato ?? null,
    animali_compilato: v?.animali_compilato === true,
    nucleo_compilato: v?.nucleo_compilato === true,
    presentazione: v?.presentazione ?? null,
    verificato: v?.verificato === true,
    protestiVerificati: v?.protesti_verificati === true,
    coperturaReddito: ver.coperturaReddito,
    redditoScaduto: ver.redditoScaduto,
  };
}

/**
 * Mette insieme ciò che il proprietario vede di ogni candidatura: i dati
 * della vista e il match sui criteri che ha chiesto.
 *
 * Finché la candidatura è in attesa il match si ricalcola sui dati attuali.
 * Dopo la decisione si mostra la valutazione registrata in quel momento; se
 * manca o è illeggibile (candidature decise prima che esistesse) si ricalcola.
 */
export function assemblaCandidature(input: {
  candidature: RigaCandidatura[];
  vista: RigaVistaCandidato[];
  valutazioni: { candidatura_id: string; valutazione: unknown }[];
  criteriPerListing: Map<string, CriterioRichiesto[]>;
  /** le recensioni di ogni inquilino (voto, chi l'ha scritta, quando): servono per le stelle e per il badge */
  recensioniPerTenant: Map<string, RecensioneGrezza[]>;
  /** per provarla; di solito è adesso */
  ora?: number;
}): CandidaturaRicevuta[] {
  const vistaPer = new Map(input.vista.map((v) => [v.candidatura_id, v]));
  const valutazionePer = new Map(input.valutazioni.map((v) => [v.candidatura_id, v.valutazione]));

  return input.candidature.map((c) => {
    const v = vistaPer.get(c.id);
    const recensioniGrezze = input.recensioniPerTenant.get(c.tenant_id) ?? [];

    const registrata = c.status !== "in_attesa" ? leggiFotografia(valutazionePer.get(c.id)) : null;

    const valutazione = registrata
      ? { ...registrata, congelata: true }
      : {
          ...valutaCandidato({
            criteri: input.criteriPerListing.get(c.listing_id) ?? [],
            canone: c.listings?.prezzo ?? 0,
            profilo: profiloDaVista(v),
            recensioni: riepilogoRecensioni(recensioniGrezze.map((r) => r.voto)),
            raccomandato: statoRaccomandazione(recensioniGrezze, input.ora).raccomandato,
          }),
          congelata: false,
        };

    return {
      id: c.id,
      status: c.status,
      match_pct: c.match_pct,
      created_at: c.created_at,
      tenant_id: c.tenant_id,
      listing_id: c.listing_id,
      listings: c.listings,
      tenant_profiles: {
        professione: v?.professione ?? null,
        reddito_mensile: v?.reddito_mensile ?? null,
        reddito_nucleo: v?.reddito_nucleo ?? null,
        verificato: v?.verificato === true,
        protesti_verificati: v?.protesti_verificati === true,
        reddito_scaduto: v?.reddito_scaduto === true,
        reddito_verificato_at: v?.reddito_verificato_at ?? null,
        reddito_nucleo_verificato: v?.reddito_nucleo_verificato ?? null,
        protesti_scaduti: v?.protesti_scaduti === true,
        protesti_verificati_at: v?.protesti_verificati_at ?? null,
        situazione_confermata_at: v?.situazione_confermata_at ?? null,
        protestato: v?.protestato ?? null,
        presentazione: v?.presentazione ?? null,
        avatar_url: v?.avatar_url ?? null,
      },
      nome: v?.nome ?? null,
      cognome: v?.cognome ?? null,
      valutazione,
    };
  });
}
