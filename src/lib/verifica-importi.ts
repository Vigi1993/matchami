/**
 * Gli IMPORTI che lo staff scrive quando verifica il reddito: per ogni prova che riconosce valida, quanto dimostra al mese. Logica pura, senza database:
 * si prova con `npm test`. Le regole vere stanno nella migrazione 0040 (`esito_verifica_inquilino`): qui si controlla PRIMA di chiamarla, per dire allo staff
 * cosa non va in italiano e non con un codice.
 *
 * Una prova senza importo viene scartata (non vale e si cancella). Per ogni persona del nucleo con un reddito serve almeno una prova con importo; se una
 * persona ne ha due, conta la più alta, una volta sola. Il totale si confronta con il reddito dichiarato del nucleo (copertura).
 */
import { copertura, fraseCopertura, percettoriDaDocumentare, redditoDichiarato } from "./scadenze-verifiche";

export const IMPORTO_MASSIMO = 100000;

export type DocumentoDaStimare = { id: string; persona: number; nome?: string };
export type ImportoDocumento = { documento: string; importo: number };

/**
 * Legge un importo scritto a mano: «1500», «1.500», «1 500», «1500,00», «€ 1.500» → 1500. Vuoto, zero, negativo, testo o oltre il massimo → `null`.
 * Si arrotonda all'euro (la virgola è il decimale; il punto è il separatore delle migliaia).
 */
export function leggiImporto(testo: string | null | undefined): number | null {
  if (typeof testo !== "string") return null;
  const pulito = testo.replace(/[€\s]/g, "").replace(/\./g, "").replace(",", ".");
  if (pulito === "" || !/^\d+(\.\d+)?$/.test(pulito)) return null;
  const n = Math.round(Number(pulito));
  return Number.isFinite(n) && n > 0 && n <= IMPORTO_MASSIMO ? n : null;
}

export type EsitoImporti = { ok: true; importi: ImportoDocumento[] } | { ok: false; errore: string };

/**
 * Dai valori scritti nel modulo (per identificativo del documento) agli importi da mandare al database. Un campo vuoto = prova scartata; un campo
 * scritto male = errore (non lo si ignora in silenzio).
 */
export function importiDaForm(input: { documenti: readonly DocumentoDaStimare[]; valori: Readonly<Record<string, string | undefined>>; redditiNucleo: number | null | undefined }): EsitoImporti {
  const importi: ImportoDocumento[] = [];
  for (const d of input.documenti) {
    const grezzo = input.valori[d.id];
    if (grezzo === undefined || grezzo.trim() === "") continue;
    const n = leggiImporto(grezzo);
    if (n === null) return { ok: false, errore: `L'importo di «${d.nome ?? "un documento"}» non è valido: scrivi un numero di euro al mese, da 1 a ${IMPORTO_MASSIMO.toLocaleString("it-IT")}.` };
    importi.push({ documento: d.id, importo: n });
  }
  if (importi.length === 0) return { ok: false, errore: "Scrivi l'importo mensile di almeno una prova del reddito, oppure respingi la richiesta." };
  const persone = percettoriDaDocumentare(input.redditiNucleo);
  const coperte = new Set(importi.map((i) => input.documenti.find((d) => d.id === i.documento)?.persona ?? 1));
  for (let p = 1; p <= persone; p++) {
    if (!coperte.has(p)) return { ok: false, errore: persone === 1 ? "Manca l'importo della prova del reddito." : `Manca l'importo della prova della persona ${p} di ${persone}: ogni persona del nucleo con un reddito ne ha bisogno (o respingi la richiesta).` };
  }
  return { ok: true, importi };
}

/**
 * Quanto reddito del nucleo risulterebbe verificato con questi importi: per ogni persona UNA prova (la più alta), sommate; le persone fuori dal nucleo non contano.
 * Gli importi illeggibili o i campi vuoti non contano.
 */
export function sommaNucleo(input: { documenti: readonly DocumentoDaStimare[]; valori: Readonly<Record<string, string | undefined>>; redditiNucleo: number | null | undefined }): number {
  const persone = percettoriDaDocumentare(input.redditiNucleo);
  const migliore = new Map<number, number>();
  for (const d of input.documenti) {
    const n = leggiImporto(input.valori[d.id]);
    if (n === null || d.persona > persone || d.persona < 1) continue;
    migliore.set(d.persona, Math.max(migliore.get(d.persona) ?? 0, n));
  }
  return [...migliore.values()].reduce((a, b) => a + b, 0);
}

/** L'anteprima per lo staff: «€1500 verificati su €3000 dichiarati (50%)», con il reddito dichiarato del nucleo (o personale). */
export function anteprimaCopertura(input: { documenti: readonly DocumentoDaStimare[]; valori: Readonly<Record<string, string | undefined>>; redditiNucleo: number | null | undefined; redditoNucleo: number | null | undefined; redditoMensile: number | null | undefined }): { testo: string; completa: boolean; somma: number } {
  const somma = sommaNucleo(input);
  const dichiarato = redditoDichiarato(input.redditoNucleo, input.redditoMensile);
  if (somma === 0) return { testo: "Scrivi gli importi per vedere quanta parte del reddito dichiarato risulterà verificata.", completa: false, somma };
  return { testo: fraseCopertura(dichiarato, somma), completa: copertura(dichiarato, somma) >= 1, somma };
}
