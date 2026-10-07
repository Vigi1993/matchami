import { leggiFotografia, valutaCandidato } from "@/lib/match";
import type { CriterioRichiesto, ProfiloCandidato } from "@/lib/match";
import type { CandidaturaRicevuta } from "@/lib/types";

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
};

/** Le colonne da chiedere alla vista, in un posto solo. */
export const COLONNE_VISTA_CANDIDATI =
  "candidatura_id, nome, cognome, professione, reddito_mensile, reddito_nucleo, garante, fideiussione, protestato, verificato, presentazione, avatar_url, animali_compilato, nucleo_compilato";

/** Dalla riga della vista al profilo che legge il calcolo del match. */
export function profiloDaVista(v: Partial<RigaVistaCandidato> | null | undefined): ProfiloCandidato {
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
  votiPerTenant: Map<string, number[]>;
}): CandidaturaRicevuta[] {
  const vistaPer = new Map(input.vista.map((v) => [v.candidatura_id, v]));
  const valutazionePer = new Map(input.valutazioni.map((v) => [v.candidatura_id, v.valutazione]));

  return input.candidature.map((c) => {
    const v = vistaPer.get(c.id);
    const voti = input.votiPerTenant.get(c.tenant_id) ?? [];

    const registrata = c.status !== "in_attesa" ? leggiFotografia(valutazionePer.get(c.id)) : null;

    const valutazione = registrata
      ? { ...registrata, congelata: true }
      : {
          ...valutaCandidato({
            criteri: input.criteriPerListing.get(c.listing_id) ?? [],
            canone: c.listings?.prezzo ?? 0,
            profilo: profiloDaVista(v),
            mediaRecensioni: voti.length > 0 ? voti.reduce((a, b) => a + b, 0) / voti.length : null,
            numeroRecensioni: voti.length,
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
        presentazione: v?.presentazione ?? null,
        avatar_url: v?.avatar_url ?? null,
      },
      nome: v?.nome ?? null,
      cognome: v?.cognome ?? null,
      valutazione,
    };
  });
}
