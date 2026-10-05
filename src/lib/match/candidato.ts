import { computeAffidabilita } from "../affidabilita";
import { calcolaMatchProprietario } from "./proprietario";
import type {
  CriterioRichiesto,
  DatiCandidato,
  RisultatoProprietario,
} from "./tipi";

/**
 * I campi di `tenant_profiles` che il proprietario può leggere di chi si
 * è candidato. Le zone e le caratteristiche desiderate NON ci sono: sono
 * preferenze di ricerca, e la sicurezza del database le tiene leggibili
 * solo dall'inquilino.
 */
export type ProfiloCandidato = {
  professione: string | null;
  reddito_mensile: number | null;
  reddito_nucleo: number | null;
  garante: boolean | null;
  fideiussione: boolean | null;
  protestato: boolean | null;
  animali: boolean | null;
  nucleo: string | null;
  presentazione: string | null;
  verificato: boolean;
};

/**
 * Quanto è compilato il profilo PERSONALE, in percentuale.
 *
 * Non coincide con la barra che l'inquilino vede nel suo profilo: quella
 * conta anche le zone di interesse, che il proprietario non può leggere.
 * Qui si contano solo i dati che il proprietario ha davanti.
 */
export function completezzaProfiloPersonale(p: ProfiloCandidato): number {
  const campi = [
    !!p.professione,
    !!p.reddito_mensile,
    !!p.reddito_nucleo,
    p.garante !== null,
    p.animali !== null,
    (p.presentazione ?? "").trim().length > 10,
    p.nucleo !== null,
    p.fideiussione !== null,
  ];
  return Math.round((campi.filter(Boolean).length / campi.length) * 100);
}

/**
 * Dal profilo salvato ai dati che il calcolo del match legge.
 *
 * Un reddito del nucleo a 0 vale "non indicato": nel modulo dei dati lo
 * slider parte da zero, e chi non lo tocca non ha dichiarato di non
 * guadagnare nulla.
 */
export function datiCandidatoDaProfilo(p: ProfiloCandidato): DatiCandidato {
  return {
    redditoMensileNucleo:
      p.reddito_nucleo !== null && p.reddito_nucleo > 0 ? p.reddito_nucleo : null,
    garante: p.garante,
    fideiussione: p.fideiussione,
    verificato: p.verificato,
    completezza: completezzaProfiloPersonale(p),
    protestato: p.protestato,
  };
}

export type ValutazioneCandidato = {
  match: RisultatoProprietario;
  /** punteggio di affidabilità della persona, valido per ogni casa */
  affidabilita: number;
};

/**
 * Tutto ciò che il proprietario vede di un candidato per un annuncio: il
 * match sui suoi criteri e, accanto, l'affidabilità. Le due cose restano
 * separate (D4): l'affidabilità non entra nella percentuale.
 */
export function valutaCandidato(input: {
  criteri: CriterioRichiesto[];
  /** il canone dell'annuncio */
  canone: number;
  profilo: ProfiloCandidato;
  mediaRecensioni: number | null;
  numeroRecensioni: number;
}): ValutazioneCandidato {
  const { profilo } = input;

  const affidabilita = computeAffidabilita({
    verificato: profilo.verificato,
    protestato: profilo.protestato,
    garante: profilo.garante,
    fideiussione: profilo.fideiussione,
    professione: profilo.professione,
    reddito_mensile: profilo.reddito_mensile,
    mediaRecensioni: input.mediaRecensioni,
    numeroRecensioni: input.numeroRecensioni,
  }).punteggio;

  return {
    match: calcolaMatchProprietario(
      input.criteri,
      datiCandidatoDaProfilo(profilo),
      input.canone
    ),
    affidabilita,
  };
}

/**
 * Rilegge una fotografia salvata nel database. I dati escono da una
 * colonna jsonb, quindi si controlla la forma invece di fidarsi: se è
 * rovinata, il chiamante ricalcola.
 */
export function leggiFotografia(grezzo: unknown): ValutazioneCandidato | null {
  if (typeof grezzo !== "object" || grezzo === null) return null;
  const { match, affidabilita } = grezzo as Record<string, unknown>;
  if (typeof affidabilita !== "number") return null;
  if (typeof match !== "object" || match === null) return null;

  const m = match as Record<string, unknown>;
  const punteggioOk = m.punteggio === null || typeof m.punteggio === "number";
  if (
    !punteggioOk ||
    typeof m.bloccato !== "boolean" ||
    typeof m.incompleto !== "boolean" ||
    !Array.isArray(m.criteri) ||
    !Array.isArray(m.mancanti)
  ) {
    return null;
  }
  return { match: match as RisultatoProprietario, affidabilita };
}
