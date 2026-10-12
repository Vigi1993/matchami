/**
 * Il solo punto in cui si decide QUALE fonte di quotazioni si usa.
 *
 * PER METTERE LE QUOTAZIONI OMI (o un'altra fonte vera)
 *   1. si scrive un file in questa cartella che rispetta `ProviderQuotazioni` (vedi
 *      tipi.ts) e restituisce `origine: "fornitore"`, con `fonte` e `aggiornamento`
 *      veri (per esempio «Agenzia delle Entrate, OMI» e «2° semestre 2025»);
 *   2. lo si registra qui sotto in `FORNITORI_QUOTAZIONI`;
 *   3. si imposta QUOTAZIONI_PROVIDER con il suo `id`;
 *   4. si controlla la corrispondenza tra le zone dell'app e le zone OMI (le zone OMI
 *      sono più fini e hanno codici propri): oggi una zona dell'app è un nome, e una
 *      zona OMI può coprirne più di una, o viceversa;
 *   5. si sostituiscono i coefficienti per la classe energetica (FATTORI_ENERGIA in
 *      consiglio.ts) con valori che abbiano una fonte, e si mette a `false`
 *      COEFFICIENTI_ENERGIA_PROVVISORI.
 * I test del contratto (scripts/test-prezzi.mjs) girano su ogni fonte registrata.
 * Il fornitore riceve SOLO il nome della zona: se ne servisse di più (un indirizzo),
 * sarebbe un dato in uscita verso un terzo e andrebbe rivista l'informativa.
 */
import { fornitoreProvvisorio } from "./provvisorio";
import type { ProviderQuotazioni, RisultatoQuotazione } from "./tipi";

export const FORNITORI_QUOTAZIONI: Readonly<Record<string, ProviderQuotazioni>> = {
  [fornitoreProvvisorio.id]: fornitoreProvvisorio,
};

export const FORNITORE_QUOTAZIONI_PREDEFINITO = fornitoreProvvisorio.id;

/** Un nome sbagliato è un errore di configurazione e si dice, non si ripiega in silenzio. */
export function fornitoreQuotazioni(nome?: string | null): ProviderQuotazioni {
  const scelto = (nome ?? process.env.QUOTAZIONI_PROVIDER ?? "").trim() || FORNITORE_QUOTAZIONI_PREDEFINITO;
  const f = Object.prototype.hasOwnProperty.call(FORNITORI_QUOTAZIONI, scelto) ? FORNITORI_QUOTAZIONI[scelto] : undefined;
  if (!f) throw new Error(`Fonte di quotazioni sconosciuta: «${scelto}». Quelle disponibili: ${Object.keys(FORNITORI_QUOTAZIONI).join(", ")}.`);
  return f;
}

/**
 * Le quotazioni di un elenco di zone, per la schermata. Se la fonte non è configurata
 * bene o un'interrogazione fallisce si restituisce quello che si è riusciti a leggere:
 * il consiglio sul prezzo è un di più, e un errore qui non deve impedire di
 * pubblicare un annuncio.
 */
export async function quotazioniPerZone(zone: readonly string[]): Promise<Record<string, RisultatoQuotazione>> {
  let fonte: ProviderQuotazioni;
  try {
    fonte = fornitoreQuotazioni();
  } catch {
    return {};
  }
  const risultati: Record<string, RisultatoQuotazione> = {};
  await Promise.all(
    zone.map(async (z) => {
      try {
        const q = await fonte.quotazione(z);
        if (q) risultati[z] = q;
      } catch {
        // una zona che non si riesce a leggere resta senza consiglio
      }
    })
  );
  return risultati;
}

export type { ProviderQuotazioni, Quotazione, RisultatoQuotazione, OrigineQuotazione } from "./tipi";
