/**
 * Il solo punto in cui si decide QUALE fornitore di invio email si usa.
 *
 * PER SCEGLIERE UN FORNITORE VERO
 *   1. si scrive un file in questa cartella che rispetta `ProviderEmail` (vedi
 *      tipi.ts) e restituisce `origine: "fornitore"`;
 *   2. lo si registra qui sotto in `FORNITORI_EMAIL`;
 *   3. si imposta EMAIL_PROVIDER con il suo `id` e le chiavi che serve al servizio;
 *   4. si aggiorna l'informativa: gli indirizzi email e il testo delle notifiche
 *      vengono mandati a un servizio esterno (un test lo ricorda a chiunque
 *      registri un fornitore vero);
 *   5. si controlla il mittente (SPF, DKIM, DMARC) sul dominio da cui si scrive.
 * I test del contratto (scripts/test-email.mjs) girano su ogni fornitore
 * registrato: se il nuovo non rispetta il contratto, falliscono.
 */
import { creaFornitoreProvvisorio } from "./provvisorio";
import type { DipendenzeEmail, ProviderEmail } from "./tipi";

type Fabbrica = (dipendenze: DipendenzeEmail) => ProviderEmail;

export const FORNITORI_EMAIL: Readonly<Record<string, Fabbrica>> = {
  provvisorio: (d) => creaFornitoreProvvisorio(d.depositaProva),
};

export const FORNITORE_EMAIL_PREDEFINITO = "provvisorio";

/**
 * Il fornitore da usare. Senza configurazione, quello provvisorio. Un nome che
 * non esiste è un errore di configurazione e si dice, invece di ripiegare in
 * silenzio su un altro: sarebbe peggio.
 */
export function fornitoreEmail(nome: string | null | undefined, dipendenze: DipendenzeEmail): ProviderEmail {
  const scelto = (nome ?? "").trim() || FORNITORE_EMAIL_PREDEFINITO;
  const fabbrica = Object.prototype.hasOwnProperty.call(FORNITORI_EMAIL, scelto) ? FORNITORI_EMAIL[scelto] : undefined;
  if (!fabbrica) {
    throw new Error(`Fornitore di email sconosciuto: «${scelto}». Quelli disponibili: ${Object.keys(FORNITORI_EMAIL).join(", ")}.`);
  }
  return fabbrica(dipendenze);
}

export type { DipendenzeEmail, EsitoInvio, MessaggioEmail, OrigineEmail, ProviderEmail } from "./tipi";
