import { ordinaCandidati } from "./match";
import { estratto, nomeBreve, type SchedaInquilino } from "./proprietario/possibili-inquilini";
import type { RiepilogoRecensioni } from "./recensioni";
import type { CandidaturaRicevuta } from "./types";
import type { PossibiliPerCasa } from "./proprietario/possibili-server";

import { leggiVerificheVista } from "./scadenze-verifiche";
/**
 * Il Database inquilini del proprietario: per ogni casa, tre gruppi di persone.
 *   - CANDIDATURE SPONTANEE: chi si è candidato da solo e aspetta una risposta;
 *   - POSSIBILI MATCH: chi non si è candidato ma cerca una casa come questa (si può mandare una richiesta);
 *   - GIÀ VALUTATI: i match fatti e le persone scartate (e chi ha ritirato la candidatura).
 * Logica pura, senza database: si prova con `npm test`.
 */
export type CasaDatabase = {
  id: string;
  titolo: string;
  zona: string;
  prezzo: number;
  foto: string | null;
  pubblicata: boolean;
  verificata: boolean;
};

export type GruppoAnnuncio = {
  casa: CasaDatabase;
  spontanei: CandidaturaRicevuta[];
  match: CandidaturaRicevuta[];
  scartati: CandidaturaRicevuta[];
  ritirati: CandidaturaRicevuta[];
  /** i possibili match di questa casa; `null` se non si calcolano (casa non pubblicata, o numero non disponibile) */
  possibili: PossibiliPerCasa | null;
};

const recente = (a: CandidaturaRicevuta, b: CandidaturaRicevuta) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0);

/** Le candidature da valutare: prima chi rispetta i criteri obbligatori, poi per percentuale, badge, affidabilità. Senza valutazioni, l'ordine di arrivo. */
function ordinaDaValutare(lista: CandidaturaRicevuta[]): CandidaturaRicevuta[] {
  if (lista.length === 0 || !lista.every((c) => c.valutazione)) return [...lista].sort(recente);
  return ordinaCandidati(
    lista.map((c) => ({
      c,
      match: c.valutazione!.match,
      affidabilita: c.valutazione!.affidabilita,
      recensioni: c.valutazione!.recensioni ?? null,
      raccomandato: c.valutazione!.raccomandato === true,
    }))
  ).map((v) => v.c);
}

export function raggruppaPerAnnuncio(input: {
  case_: readonly CasaDatabase[];
  candidature: readonly CandidaturaRicevuta[];
  possibili: readonly PossibiliPerCasa[];
  /** lo stato di una candidatura adesso (può essere appena cambiato dal proprietario) */
  stato: (c: CandidaturaRicevuta) => string;
}): GruppoAnnuncio[] {
  const case_ = new Map<string, CasaDatabase>(input.case_.map((c) => [c.id, c]));
  const perCasa = new Map<string, CandidaturaRicevuta[]>();
  for (const c of input.candidature) {
    perCasa.set(c.listing_id, [...(perCasa.get(c.listing_id) ?? []), c]);
    // una casa che non è tra quelle note (cancellata, o non letta) si ricostruisce da ciò che dice la candidatura
    if (!case_.has(c.listing_id)) {
      case_.set(c.listing_id, { id: c.listing_id, titolo: c.listings?.titolo ?? "Annuncio", zona: c.listings?.zona ?? "", prezzo: c.listings?.prezzo ?? 0, foto: null, pubblicata: false, verificata: false });
    }
  }
  const possibiliPer = new Map(input.possibili.map((p) => [p.id, p]));

  const gruppi: GruppoAnnuncio[] = [];
  for (const casa of case_.values()) {
    const candidature = perCasa.get(casa.id) ?? [];
    const possibili = possibiliPer.get(casa.id) ?? null;
    // una casa senza candidati e che gli inquilini non vedono non ha niente da mostrare
    if (candidature.length === 0 && !possibili && !(casa.pubblicata && casa.verificata)) continue;
    const di = (stato: string) => candidature.filter((c) => input.stato(c) === stato);
    gruppi.push({
      casa,
      spontanei: ordinaDaValutare(di("in_attesa")),
      match: di("accettata").sort(recente),
      scartati: di("rifiutata").sort(recente),
      ritirati: di("ritirata").sort(recente),
      possibili,
    });
  }

  // prima le case con più candidature da valutare, poi con più possibili match, poi per titolo
  return gruppi.sort((a, b) => b.spontanei.length - a.spontanei.length || (b.possibili?.disponibili?.length ?? 0) - (a.possibili?.disponibili?.length ?? 0) || a.casa.titolo.localeCompare(b.casa.titolo));
}

/** Quante persone ci sono in ogni gruppo di una casa. */
export function conteggiGruppo(g: GruppoAnnuncio): { daValutare: number; possibili: number; match: number; scartati: number; valutati: number } {
  const valutati = g.match.length + g.scartati.length + g.ritirati.length;
  return { daValutare: g.spontanei.length, possibili: (g.possibili?.disponibili?.length ?? 0) + (g.possibili?.richieste.filter((r) => r.stato === "inviata").length ?? 0), match: g.match.length, scartati: g.scartati.length, valutati };
}

// ============================================================ la scheda di una persona

/** Il match con i criteri del proprietario, nelle tre forme che la scheda sa mostrare. */
export type MatchScheda = { tipo: "pct"; valore: number } | { tipo: "bloccato"; mancanti: string[] } | { tipo: "nessuno" };

/** Tutto ciò che serve a disegnare la scheda di una persona (candidata o possibile), uguale per i due casi. */
export type DatiScheda = {
  nome: string;
  professione: string | null;
  avatarUrl: string | null;
  /** da 0 a 100; `null` se non si sa */
  affidabilita: number | null;
  match: MatchScheda;
  raccomandato: boolean;
  recensioni: RiepilogoRecensioni | null;
  /** il reddito è verificato E la verifica vale ancora */
  redditoVerificato: boolean;
  /** la verifica del reddito c'era ma è scaduta: si dice «scaduta», mai «verificato» */
  redditoScaduto: boolean;
  /** quando è stata fatta la verifica del reddito */
  redditoVerificatoIl: string | null;
  /** quanta parte del reddito del nucleo dichiarato è documentata, da 0 a 1; `null` se non è verificato */
  coperturaReddito: number | null;
  /** il reddito del nucleo dichiarato (per dire «verificati X su Y»); `null` per i possibili match (il reddito non si mostra) */
  redditoDichiarato: number | null;
  redditoNucleoVerificato: number | null;
  /** come stanno i protesti SE li ha verificati lo staff (e la verifica vale ancora); altrimenti `null` (il dichiarato non si mostra come un fatto) */
  protestiVerificati: "nessuno" | "si" | null;
  protestiScaduti: boolean;
  protestiVerificatiIl: string | null;
  /** un estratto della presentazione, mai più di 160 caratteri */
  presentazione: string | null;
  /** manca qualche dato: il match è provvisorio */
  incompleto: boolean;
};

export function datiSchedaCandidato(c: CandidaturaRicevuta): DatiScheda {
  const v = c.valutazione;
  const tp = c.tenant_profiles;
  const ver = leggiVerificheVista(tp ?? null);
  let match: MatchScheda = { tipo: "nessuno" };
  if (v) {
    if (v.match.bloccato) match = { tipo: "bloccato", mancanti: [...v.match.mancanti] };
    else if (v.match.punteggio !== null) match = { tipo: "pct", valore: v.match.punteggio };
  }
  return {
    nome: nomeBreve(c.nome, c.cognome),
    professione: c.tenant_profiles?.professione?.trim() || null,
    avatarUrl: c.tenant_profiles?.avatar_url || null,
    affidabilita: typeof v?.affidabilita === "number" ? v.affidabilita : null,
    match,
    raccomandato: v?.raccomandato === true,
    recensioni: v?.recensioni ?? null,
    redditoVerificato: ver.redditoValido,
    redditoScaduto: ver.redditoScaduto,
    redditoVerificatoIl: ver.redditoVerificatoIl,
    coperturaReddito: ver.coperturaReddito,
    redditoDichiarato: ver.redditoDichiarato,
    redditoNucleoVerificato: ver.redditoValido ? ver.redditoNucleoVerificato : null,
    protestiVerificati: c.tenant_profiles?.protesti_verificati === true && typeof c.tenant_profiles?.protestato === "boolean" ? (c.tenant_profiles.protestato ? "si" : "nessuno") : null,
    protestiScaduti: ver.protestiScaduti,
    protestiVerificatiIl: c.tenant_profiles?.protesti_verificati === true ? ver.protestiVerificatiIl : null,
    presentazione: estratto(c.tenant_profiles?.presentazione),
    incompleto: v?.match.incompleto === true,
  };
}

export function datiSchedaPossibile(s: SchedaInquilino): DatiScheda {
  return {
    nome: s.nome,
    professione: s.professione,
    avatarUrl: s.avatarUrl,
    affidabilita: s.affidabilita,
    match: s.compatibilita === null ? { tipo: "nessuno" } : { tipo: "pct", valore: s.compatibilita },
    raccomandato: s.raccomandato,
    recensioni: s.recensioni,
    redditoVerificato: s.redditoVerificato,
    redditoScaduto: s.redditoScaduto === true,
    redditoVerificatoIl: s.redditoVerificatoIl ?? null,
    coperturaReddito: s.coperturaReddito ?? null,
    redditoDichiarato: null,
    redditoNucleoVerificato: null,
    protestiVerificati: s.protestiVerificati,
    protestiScaduti: s.protestiScaduti === true,
    protestiVerificatiIl: s.protestiVerificatiIl ?? null,
    presentazione: s.presentazione,
    incompleto: false,
  };
}

/** Il colore della percentuale: le stesse soglie delle etichette del match. */
export function classeMatch(pct: number): "is-match" | "is-wait" | "is-off" {
  if (pct >= 70) return "is-match";
  if (pct >= 50) return "is-wait";
  return "is-off";
}
