/**
 * Il fornitore di mappe PROVVISORIO. Non cerca niente: calcola una posizione di
 * prova, sempre la stessa per lo stesso indirizzo, vicino al centro della zona
 * dell'annuncio. Serve a costruire e provare tutto il percorso (salvare un
 * indirizzo, mostrarlo a chi ha un match) prima di scegliere un fornitore vero.
 *
 * I centri delle zone sono APPROSSIMATI A MANO e non vanno usati per niente
 * altro: la posizione che ne esce non è dove sta la casa.
 */
import { chiaveIndirizzo, posizioneValida } from "./indirizzo";
import type { Indirizzo, Posizione, ProviderMappe, VistaMappa } from "./tipi";

/** Il centro di Milano, per una zona che non si conosce. */
export const CENTRO_MILANO: Posizione = { latitudine: 45.4642, longitudine: 9.19 };

/** Centri approssimati delle zone di `ZONE_MILANO` (senza «, Milano»). */
export const CENTRI_ZONE: Readonly<Record<string, Posizione>> = {
  Navigli: { latitudine: 45.45, longitudine: 9.174 },
  Isola: { latitudine: 45.488, longitudine: 9.188 },
  "Porta Romana": { latitudine: 45.452, longitudine: 9.204 },
  "Città Studi": { latitudine: 45.478, longitudine: 9.23 },
  Bicocca: { latitudine: 45.519, longitudine: 9.211 },
  "Porta Nuova": { latitudine: 45.484, longitudine: 9.19 },
  "Porta Venezia": { latitudine: 45.473, longitudine: 9.205 },
  Sempione: { latitudine: 45.48, longitudine: 9.165 },
  Ticinese: { latitudine: 45.452, longitudine: 9.18 },
  Loreto: { latitudine: 45.485, longitudine: 9.215 },
  NoLo: { latitudine: 45.495, longitudine: 9.218 },
  Certosa: { latitudine: 45.5, longitudine: 9.145 },
  Lambrate: { latitudine: 45.485, longitudine: 9.24 },
};

/** Di quanto, al massimo, si sposta la posizione dal centro della zona (gradi: circa 400 m e 500 m). */
export const SPOSTAMENTO_MASSIMO = { latitudine: 0.0035, longitudine: 0.0065 } as const;

/** FNV-1a a 32 bit: veloce, senza dipendenze, e sempre uguale per lo stesso testo. */
function impronta(testo: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < testo.length; i++) {
    h ^= testo.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Il centro della zona («Isola, Milano» → Isola), o quello di Milano. */
export function centroDellaZona(zona: string | null | undefined): Posizione {
  const nome = (typeof zona === "string" ? zona : "").replace(/,\s*Milano\s*$/i, "").trim();
  // proprietà PROPRIA: un nome come «__proto__» o «constructor» esiste in ogni oggetto e non è una zona
  return Object.prototype.hasOwnProperty.call(CENTRI_ZONE, nome) ? CENTRI_ZONE[nome] : CENTRO_MILANO;
}

/** Un numero tra -1 e 1, sempre lo stesso per lo stesso testo e lo stesso «sale». */
function frazione(testo: string, sale: string): number {
  return (impronta(`${sale}:${testo}`) / 0xffffffff) * 2 - 1;
}

export const fornitoreProvvisorio: ProviderMappe = {
  id: "provvisorio",
  origine: "provvisoria",

  async geocodifica(indirizzo: Indirizzo, contesto?: { zona?: string | null }): Promise<Posizione | null> {
    const chiave = chiaveIndirizzo(indirizzo);
    if (!chiave) return null;
    const centro = centroDellaZona(contesto?.zona);
    const p: Posizione = {
      latitudine: Math.round((centro.latitudine + frazione(chiave, "lat") * SPOSTAMENTO_MASSIMO.latitudine) * 1e6) / 1e6,
      longitudine: Math.round((centro.longitudine + frazione(chiave, "lng") * SPOSTAMENTO_MASSIMO.longitudine) * 1e6) / 1e6,
    };
    return posizioneValida(p) ? p : null;
  },

  vistaMappa(): VistaMappa {
    return { tipo: "provvisoria", etichetta: "Mappa provvisoria: la posizione è approssimativa" };
  },
};
