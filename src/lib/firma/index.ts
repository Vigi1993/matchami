/**
 * Il solo punto in cui si decide QUALE servizio di firma si usa.
 *
 * PER COLLEGARE UN SERVIZIO VERO (punto 34)
 *   1. si scrive un file in questa cartella che rispetta `ProviderFirma` (vedi tipi.ts) con `origine: "fornitore"`;
 *   2. lo si registra qui sotto in `FORNITORI_FIRMA`;
 *   3. si imposta FIRMA_PROVIDER con il suo `id`;
 *   4. SI SCRIVE UNA MIGRAZIONE con una funzione riservata al ruolo di servizio che registra la firma vera e porta il
 *      contratto a «firmato» (oggi nessuna funzione può farlo), e si toglie al proprietario il permesso di scrivere
 *      «firmato» a mano (oggi la regola dei contratti glielo consente);
 *   5. si aggiorna l'informativa: nomi e indirizzi email vanno al servizio, e il documento da firmare anche (un test
 *      lo ricorda a chi registra un servizio vero).
 * Finché il servizio registrato non è quello di prova, l'azione di firma si ferma con un errore: non registra mai
 * come «di prova» una firma vera.
 */
import { fornitoreFirmaProvvisorio } from "./provvisorio";
import type { ProviderFirma } from "./tipi";

export const FORNITORI_FIRMA: Readonly<Record<string, ProviderFirma>> = {
  [fornitoreFirmaProvvisorio.id]: fornitoreFirmaProvvisorio,
};

export const FORNITORE_FIRMA_PREDEFINITO = fornitoreFirmaProvvisorio.id;

/** Un nome sbagliato è un errore di configurazione e si dice, non si ripiega in silenzio. */
export function fornitoreFirma(nome?: string | null): ProviderFirma {
  const scelto = (nome ?? process.env.FIRMA_PROVIDER ?? "").trim() || FORNITORE_FIRMA_PREDEFINITO;
  const f = Object.prototype.hasOwnProperty.call(FORNITORI_FIRMA, scelto) ? FORNITORI_FIRMA[scelto] : undefined;
  if (!f) throw new Error(`Servizio di firma sconosciuto: «${scelto}». Quelli disponibili: ${Object.keys(FORNITORI_FIRMA).join(", ")}.`);
  return f;
}

export type { EsitoFirma, FirmaContratto, OrigineFirma, ProviderFirma, RichiestaFirma } from "./tipi";
