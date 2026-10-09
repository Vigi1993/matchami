/**
 * Il solo punto in cui si decide QUALE fornitore di mappe si usa.
 *
 * PER SCEGLIERE UN FORNITORE VERO
 *   1. si scrive un file in questa cartella che rispetta `ProviderMappe` (vedi
 *      tipi.ts) e restituisce `origine: "fornitore"`;
 *   2. lo si registra qui sotto in `FORNITORI`;
 *   3. si imposta MAPPE_PROVIDER con il suo `id`;
 *   4. si ricalcolano le posizioni provvisorie già salvate (si riconoscono dal
 *      campo che dice come è stata ottenuta la posizione: `provvisoria`);
 *   5. si aggiorna l'informativa: l'indirizzo viene mandato a un servizio
 *      esterno (un test lo ricorda a chiunque registri un fornitore vero).
 * I test del contratto (scripts/test-mappe.mjs) girano su ogni fornitore
 * registrato: se il nuovo non rispetta il contratto, falliscono.
 */
import { fornitoreProvvisorio } from "./provvisorio";
import type { ProviderMappe } from "./tipi";

export const FORNITORI: Readonly<Record<string, ProviderMappe>> = {
  [fornitoreProvvisorio.id]: fornitoreProvvisorio,
};

export const FORNITORE_PREDEFINITO = fornitoreProvvisorio.id;

/**
 * Il fornitore da usare. Senza configurazione, quello provvisorio. Un nome che
 * non esiste è un errore di configurazione e si dice, invece di ripiegare in
 * silenzio su un altro: sarebbe peggio.
 */
export function fornitoreMappe(nome?: string | null): ProviderMappe {
  const scelto = (nome ?? process.env.MAPPE_PROVIDER ?? "").trim() || FORNITORE_PREDEFINITO;
  const f = Object.prototype.hasOwnProperty.call(FORNITORI, scelto) ? FORNITORI[scelto] : undefined;
  if (!f) throw new Error(`Fornitore di mappe sconosciuto: «${scelto}». Quelli disponibili: ${Object.keys(FORNITORI).join(", ")}.`);
  return f;
}

export type { Indirizzo, IndirizzoConVista, Posizione, OrigineePosizione, ProviderMappe, VistaMappa } from "./tipi";

/**
 * Da una riga del database a un indirizzo con la mappa pronta. Se il fornitore
 * non è configurato bene, l'indirizzo si mostra lo stesso, senza mappa: una
 * configurazione sbagliata non deve impedire di vedere dove sta la casa.
 */
export function conVista(riga: {
  via: string;
  civico: string;
  cap: string;
  citta: string;
  latitudine: number;
  longitudine: number;
  origine_posizione: string;
}): import("./tipi").IndirizzoConVista {
  const indirizzo = { via: riga.via, civico: riga.civico, cap: riga.cap, citta: riga.citta };
  const origine = riga.origine_posizione === "fornitore" ? "fornitore" : "provvisoria";
  try {
    return { indirizzo, origine, vista: fornitoreMappe().vistaMappa({ latitudine: riga.latitudine, longitudine: riga.longitudine }, indirizzo) };
  } catch {
    return { indirizzo, origine, vista: null };
  }
}
