/**
 * La ricerca e i filtri nel Database inquilini: quali candidature mostrare
 * dato ciò che il proprietario ha scritto e scelto. Logica pura, senza
 * database: si prova con `npm test`.
 *
 * Tutto avviene sui dati che la schermata ha GIÀ in pagina: non si legge,
 * non si salva e non si invia niente di nuovo, nemmeno ciò che si cerca.
 *
 * Non c'è nessun filtro su caratteristiche personali (nucleo, figli,
 * animali): coerentemente con la scelta di non averne nei criteri.
 */
import type { CandidaturaRicevuta } from "./types";

export type FiltroStato = "tutte" | "da_valutare" | "valutate";

/** Le soglie sono quelle delle etichette di compatibilità della schermata (70 e 50). */
export type MinimoCompatibilita = 0 | 50 | 70;
export const SOGLIE_COMPATIBILITA: readonly MinimoCompatibilita[] = [0, 50, 70];

export type Filtri = {
  testo: string;
  stato: FiltroStato;
  soloVerificati: boolean;
  senzaBlocchi: boolean;
  minimo: MinimoCompatibilita;
  /** un solo annuncio, o tutti (nullo) */
  annuncioId: string | null;
};

export const FILTRI_VUOTI: Filtri = Object.freeze({
  testo: "",
  stato: "tutte",
  soloVerificati: false,
  senzaBlocchi: false,
  minimo: 0,
  annuncioId: null,
});

/** Quanti caratteri si considerano di ciò che si cerca. */
export const LUNGHEZZA_MASSIMA_RICERCA = 100;

/**
 * Minuscole, senza accenti, spazi ridotti a uno, accorciato. Un valore che non
 * è testo vale testo vuoto: la ricerca non deve mai far crollare la schermata.
 */
export function normalizzaRicerca(t: unknown): string {
  if (typeof t !== "string") return "";
  return t
    .slice(0, LUNGHEZZA_MASSIMA_RICERCA * 4) // prima di lavorarlo: un testo incollato enorme non rallenta
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, LUNGHEZZA_MASSIMA_RICERCA);
}

/** Le parole cercate: ognuna deve comparire, in un punto qualunque. */
export function paroleRicerca(t: unknown): string[] {
  const n = normalizzaRicerca(t);
  return n ? n.split(" ") : [];
}

/** Tutto ciò in cui si cerca, già normalizzato. */
function testoCercabile(c: CandidaturaRicevuta): string {
  return normalizzaRicerca(
    [c.nome, c.cognome, c.tenant_profiles?.professione, c.listings?.titolo, c.listings?.zona]
      .filter((x): x is string => typeof x === "string")
      .join(" ")
  );
}

/**
 * Una candidatura rispetta i filtri? `stato` dà lo stato effettivo, che può
 * essere cambiato da una decisione appena presa e non ancora ricaricata.
 */
export function corrisponde(
  c: CandidaturaRicevuta,
  f: Filtri,
  stato: (c: CandidaturaRicevuta) => string
): boolean {
  if (f.annuncioId !== null && c.listing_id !== f.annuncioId) return false;

  const inAttesa = stato(c) === "in_attesa";
  if (f.stato === "da_valutare" && !inAttesa) return false;
  if (f.stato === "valutate" && inAttesa) return false;

  // Dopo un rifiuto del profilo resta solo il nome: chi non ha il profilo non
  // risulta verificato, e lo dice la schermata stessa.
  if (f.soloVerificati && c.tenant_profiles?.verificato !== true) return false;

  // Senza una valutazione non si può dire che sia bloccato: resta.
  if (f.senzaBlocchi && c.valutazione?.match.bloccato === true) return false;

  // Una soglia si applica a chi ha una percentuale. Chi non ce l'ha (nessun
  // criterio impostato) non può dimostrare di raggiungerla.
  if (f.minimo > 0) {
    const p = c.valutazione?.match.punteggio;
    if (typeof p !== "number" || p < f.minimo) return false;
  }

  const parole = paroleRicerca(f.testo);
  if (parole.length > 0) {
    const testo = testoCercabile(c);
    if (!parole.every((p) => testo.includes(p))) return false;
  }

  return true;
}

/** Le candidature che rispettano i filtri, nell'ordine di arrivo. */
export function filtraCandidature<T extends CandidaturaRicevuta>(
  elenco: T[],
  f: Filtri,
  stato: (c: CandidaturaRicevuta) => string
): T[] {
  return elenco.filter((c) => corrisponde(c, f, stato));
}

/** Quanti filtri sono accesi (la ricerca di testo conta come uno). */
export function numeroFiltriAttivi(f: Filtri): number {
  return (
    (normalizzaRicerca(f.testo) ? 1 : 0) +
    (f.stato !== "tutte" ? 1 : 0) +
    (f.soloVerificati ? 1 : 0) +
    (f.senzaBlocchi ? 1 : 0) +
    (f.minimo > 0 ? 1 : 0) +
    (f.annuncioId !== null ? 1 : 0)
  );
}

/**
 * Almeno un candidato ha una percentuale? Se nessuno ce l'ha (il proprietario
 * non ha impostato criteri) il filtro per compatibilità non si offre: lo
 * accenderlo nasconderebbe tutti.
 */
export function haPunteggi(elenco: CandidaturaRicevuta[]): boolean {
  return elenco.some((c) => typeof c.valutazione?.match.punteggio === "number");
}

/** Gli annunci tra cui scegliere, senza doppioni, in ordine alfabetico. */
export function opzioniAnnunci(elenco: CandidaturaRicevuta[]): { id: string; titolo: string }[] {
  const visti = new Map<string, string>();
  for (const c of elenco) {
    if (!visti.has(c.listing_id)) visti.set(c.listing_id, c.listings?.titolo ?? "Annuncio");
  }
  return [...visti].map(([id, titolo]) => ({ id, titolo })).sort((a, b) => a.titolo.localeCompare(b.titolo, "it"));
}

/**
 * I filtri ripuliti da ciò che non ha più senso sull'elenco di adesso. L'elenco
 * si ricarica quando si decide su un candidato: se un filtro puntava a un
 * annuncio che non c'è più, o a una compatibilità minima quando nessuno ha più
 * una percentuale, la schermata resterebbe vuota senza che si capisca perché.
 */
export function filtriValidi(f: Filtri, elenco: CandidaturaRicevuta[]): Filtri {
  const annuncioEsiste = f.annuncioId !== null && elenco.some((c) => c.listing_id === f.annuncioId);
  return {
    ...f,
    annuncioId: annuncioEsiste ? f.annuncioId : null,
    minimo: haPunteggi(elenco) ? f.minimo : 0,
  };
}

/** «3 candidature su 12»: quante se ne vedono, su quante ce ne sono. */
export function riepilogoRicerca(visibili: number, totale: number): string {
  if (visibili === 0) return `Nessuna candidatura su ${totale}`;
  return `${visibili} candidatur${visibili === 1 ? "a" : "e"} su ${totale}`;
}

export const TESTO_NESSUN_RISULTATO = "Nessuna candidatura corrisponde a ciò che hai cercato.";

export const ETICHETTE_STATO: Record<FiltroStato, string> = {
  tutte: "Tutte",
  da_valutare: "Da valutare",
  valutate: "Già valutate",
};

export function etichettaMinimo(m: MinimoCompatibilita): string {
  return m === 0 ? "Qualsiasi compatibilità" : `Almeno ${m}%`;
}
