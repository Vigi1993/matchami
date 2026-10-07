/**
 * Le candidature dal lato dell'inquilino: come si chiamano gli stati, come si
 * raggruppano, quando si può ritirare una candidatura e cosa si dice prima di
 * farlo. Logica pura, senza database: si prova con `npm test`.
 *
 * Il ritiro vero lo fa la funzione `ritira_candidatura` del database
 * (migrazione 0020): qui si evita solo di offrire a una persona un'azione che
 * il database rifiuterebbe.
 */
import type { StatoCandidatura } from "./types";

export const STATO_LABEL: Record<StatoCandidatura, string> = {
  in_attesa: "In attesa",
  accettata: "Match",
  rifiutata: "Non accettata",
  ritirata: "Ritirata",
};

export const STATO_BADGE: Record<StatoCandidatura, string> = {
  in_attesa: "is-wait",
  accettata: "is-match",
  rifiutata: "is-off",
  ritirata: "is-off",
};

/** Una candidatura si ritira solo finché il proprietario non l'ha valutata. */
export function puoRitirare(stato: StatoCandidatura): boolean {
  return stato === "in_attesa";
}

/** Le candidature divise per stato, nell'ordine in cui le mostra la schermata. */
export function raggruppaCandidature<T extends { status: StatoCandidatura }>(
  elenco: T[]
): { accettate: T[]; inAttesa: T[]; rifiutate: T[]; ritirate: T[] } {
  return {
    accettate: elenco.filter((c) => c.status === "accettata"),
    inAttesa: elenco.filter((c) => c.status === "in_attesa"),
    rifiutate: elenco.filter((c) => c.status === "rifiutata"),
    ritirate: elenco.filter((c) => c.status === "ritirata"),
  };
}

/** La riga sotto il titolo della schermata. Le ritirate si contano ancora tra le inviate. */
export function riepilogoCandidature(
  elenco: { status: StatoCandidatura }[]
): string {
  const n = elenco.length;
  if (n === 0) return "Gli annunci a cui ti candidi arrivano qui.";
  const { accettate, ritirate } = raggruppaCandidature(elenco);
  let testo = `${n} candidatur${n === 1 ? "a inviata" : "e inviate"}`;
  if (accettate.length > 0) testo += ` · ${accettate.length} match`;
  if (ritirate.length > 0) testo += ` · ${ritirate.length} ritirat${ritirate.length === 1 ? "a" : "e"}`;
  return testo + ".";
}

/**
 * Ciò che si dice prima di ritirare. Dice le due cose che contano: il
 * proprietario non la vede più, e non ci si può ricandidare allo stesso
 * annuncio.
 */
export function testoConfermaRitiro(titolo: string | null | undefined): string {
  const t = titolo && titolo.trim() ? `«${titolo.trim()}»` : "questo annuncio";
  return `Se ritiri la candidatura per ${t}, il proprietario non la vedrà più e non potrai candidarti di nuovo a questo annuncio. Puoi comunque candidarti ad altri.`;
}

export const NOTA_RITIRATA =
  "Hai ritirato questa candidatura: il proprietario non la vede più e non puoi ricandidarti a questo annuncio.";
