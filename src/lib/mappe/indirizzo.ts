/**
 * L'indirizzo di un immobile: pulizia, controllo e testo. Le regole sono quelle
 * della funzione `imposta_indirizzo` del database (migrazione 0024): un test le
 * tiene allineate. Logica pura, senza database.
 */
import type { Indirizzo, Posizione } from "./tipi";

export const LIMITI_INDIRIZZO = {
  via: { min: 3, max: 120 },
  civico: { min: 1, max: 12 },
  citta: { min: 2, max: 60 },
} as const;

/** L'Italia, in gradi: un indirizzo fuori da qui è quasi sempre un errore. Gli stessi limiti del database. */
export const LIMITI_POSIZIONE = { latMin: 35, latMax: 48, lngMin: 6, lngMax: 19 } as const;

export const CITTA_PREDEFINITA = "Milano";

/** Spazi ridotti a uno, ai lati niente, e nessun carattere di controllo (a capo, tabulazioni, invisibili). */
export function pulisci(testo: unknown): string {
  if (typeof testo !== "string") return "";
  return testo.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\ufeff]/g, " ").replace(/\s+/g, " ").trim();
}

export type EsitoIndirizzo = { ok: true; indirizzo: Indirizzo } | { ok: false; errore: string };

/** Pulisce e controlla ciò che la persona ha scritto. Il messaggio di errore dice cosa correggere. */
export function validaIndirizzo(input: { via?: unknown; civico?: unknown; cap?: unknown; citta?: unknown }): EsitoIndirizzo {
  const via = pulisci(input.via);
  const civico = pulisci(input.civico);
  const cap = pulisci(input.cap);
  const citta = pulisci(input.citta) || CITTA_PREDEFINITA;

  if (via.length < LIMITI_INDIRIZZO.via.min) return { ok: false, errore: "Scrivi la via, per esempio «Via Garibaldi»." };
  if (via.length > LIMITI_INDIRIZZO.via.max) return { ok: false, errore: `La via è troppo lunga (al massimo ${LIMITI_INDIRIZZO.via.max} caratteri).` };
  if (civico.length < LIMITI_INDIRIZZO.civico.min) return { ok: false, errore: "Scrivi il numero civico." };
  if (civico.length > LIMITI_INDIRIZZO.civico.max) return { ok: false, errore: `Il civico è troppo lungo (al massimo ${LIMITI_INDIRIZZO.civico.max} caratteri).` };
  if (!/^[0-9]{5}$/.test(cap)) return { ok: false, errore: "Il CAP è di cinque cifre, per esempio 20121." };
  if (citta.length < LIMITI_INDIRIZZO.citta.min) return { ok: false, errore: "Scrivi la città." };
  if (citta.length > LIMITI_INDIRIZZO.citta.max) return { ok: false, errore: `La città è troppo lunga (al massimo ${LIMITI_INDIRIZZO.citta.max} caratteri).` };

  return { ok: true, indirizzo: { via, civico, cap, citta } };
}

/** Una posizione è un numero finito dentro l'Italia, come vuole il database. */
export function posizioneValida(p: Partial<Posizione> | null | undefined): p is Posizione {
  return (
    !!p &&
    typeof p.latitudine === "number" &&
    typeof p.longitudine === "number" &&
    Number.isFinite(p.latitudine) &&
    Number.isFinite(p.longitudine) &&
    p.latitudine >= LIMITI_POSIZIONE.latMin &&
    p.latitudine <= LIMITI_POSIZIONE.latMax &&
    p.longitudine >= LIMITI_POSIZIONE.lngMin &&
    p.longitudine <= LIMITI_POSIZIONE.lngMax
  );
}

/** «Via Garibaldi 12, 20121 Milano» */
export function formattaIndirizzo(i: Indirizzo): string {
  return `${i.via} ${i.civico}, ${i.cap} ${i.citta}`;
}

/** Il testo da cui si calcola una posizione di prova: stesso indirizzo scritto in modi diversi, stesso testo. */
export function chiaveIndirizzo(i: Indirizzo): string {
  return `${i.via} ${i.civico} ${i.cap} ${i.citta}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}
