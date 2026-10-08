/**
 * I contratti nelle schermate «Gestione affitto» (inquilino) e «Gestione
 * affitti» (proprietario): come si chiamano gli stati e come si separa ciò che
 * è in corso da ciò che è passato. Logica pura, senza database: si prova con
 * `npm test`.
 *
 * Prima ogni schermata aveva la sua copia delle etichette e un elenco unico,
 * dove un contratto concluso restava mescolato per sempre a quelli in corso.
 */
import type { StatoContratto } from "./types";

/** Gli stati, nell'ordine della vita di un contratto. Sono quelli dell'enumerato del database. */
export const STATI_CONTRATTO: readonly StatoContratto[] = ["bozza", "in_firma", "firmato", "concluso"];

export const STATO_LABEL: Record<StatoContratto, string> = {
  bozza: "Bozza",
  in_firma: "In firma",
  firmato: "Firmato",
  concluso: "Concluso",
};

export const STATO_BADGE: Record<StatoContratto, string> = {
  bozza: "is-off",
  in_firma: "is-wait",
  firmato: "is-match",
  concluso: "is-off",
};

/**
 * Nello storico c'è un contratto solo se il proprietario lo ha segnato come
 * concluso. Non si sposta da solo un contratto «firmato» la cui durata è
 * finita: molti contratti si rinnovano da soli, e deciderlo al posto di chi lo
 * gestisce sarebbe un errore peggiore di un elenco un po' più lungo.
 */
export function inStorico(stato: string): boolean {
  return stato === "concluso";
}

/**
 * Divide i contratti in «in corso» e «storico», mantenendo l'ordine di
 * arrivo (dal più recente) dentro ciascun gruppo. Uno stato che non si
 * conosce (aggiunto dal database prima del codice) resta tra quelli in
 * corso: una scheda non deve sparire.
 */
export function raggruppaContratti<T extends { stato: string }>(
  elenco: T[]
): { inCorso: T[]; storico: T[] } {
  return {
    inCorso: elenco.filter((c) => !inStorico(c.stato)),
    storico: elenco.filter((c) => inStorico(c.stato)),
  };
}

/** L'etichetta di uno stato; per uno sconosciuto, il testo com'è (mai «undefined»). */
export function etichettaStato(stato: string): string {
  return (STATO_LABEL as Record<string, string>)[stato] ?? stato;
}

/** L'aspetto della sigla di uno stato; per uno sconosciuto, quello neutro. */
export function badgeStato(stato: string): string {
  return (STATO_BADGE as Record<string, string>)[stato] ?? "is-off";
}

/** Cosa si dice quando ci sono solo contratti nello storico. */
export const NESSUN_CONTRATTO_IN_CORSO = "Nessun contratto in corso.";
