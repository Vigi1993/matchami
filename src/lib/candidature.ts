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

/** Le due schede della pagina «I tuoi match»: ciò che hai fatto tu, e ciò che ti arriva dai proprietari. */
export const SCHEDE_MATCH = [
  { id: "candidature", etichetta: "Le tue candidature" },
  { id: "richieste", etichetta: "Richieste dei proprietari" },
] as const;
export type SchedaMatch = (typeof SCHEDE_MATCH)[number]["id"];

/** Le parti in cui si dividono le candidature, nell'ordine in cui compaiono. */
export const SEZIONI_CANDIDATURE = [
  { id: "match", titolo: "Match", stato: "accettata", aperta: true },
  { id: "in_attesa", titolo: "In attesa di risposta", stato: "in_attesa", aperta: true },
  { id: "non_andate", titolo: "Non andate a buon fine", stato: "rifiutata", aperta: false },
  { id: "ritirate", titolo: "Ritirate", stato: "ritirata", aperta: false },
] as const satisfies readonly { id: string; titolo: string; stato: StatoCandidatura; aperta: boolean }[];

export type SezioneCandidature<T> = {
  id: (typeof SEZIONI_CANDIDATURE)[number]["id"];
  titolo: string;
  items: T[];
  /** si presenta aperta o chiusa all'inizio */
  aperta: boolean;
};

/**
 * Le candidature divise nelle loro parti, SOLO quelle che hanno qualcosa, nell'ordine fisso (match, in attesa, non
 * andate a buon fine, ritirate). Match e in attesa partono aperte; le due che chiudono la storia partono chiuse, per
 * non coprire ciò che conta, TRANNE quando non c'è altro: se non è aperta nessuna parte, si aprono tutte (una pagina
 * con soli titoli chiusi sembrerebbe vuota).
 */
export function sezioniCandidature<T extends { status: StatoCandidatura }>(elenco: T[]): SezioneCandidature<T>[] {
  const parti = SEZIONI_CANDIDATURE.map((d) => ({ id: d.id, titolo: d.titolo, items: elenco.filter((c) => c.status === d.stato), aperta: d.aperta as boolean })).filter((p) => p.items.length > 0);
  return parti.some((p) => p.aperta) ? parti : parti.map((p) => ({ ...p, aperta: true }));
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
