/**
 * Le quotazioni degli affitti: i tipi comuni a ogni fonte. Il resto dell'app parla
 * SOLO con questi tipi; quale fonte sia (i dati dell'Agenzia delle Entrate, OMI, o i
 * dati di prova) lo sa soltanto `index.ts`. Scegliere una fonte vuol dire scrivere un
 * file che rispetta `ProviderQuotazioni` e registrarlo là: niente altro cambia.
 */

/** Euro al metro quadro al MESE, per un'abitazione civile in stato normale. */
export type Quotazione = {
  min: number;
  max: number;
};

export type OrigineQuotazione = "provvisoria" | "fornitore";

export type RisultatoQuotazione = Quotazione & {
  origine: OrigineQuotazione;
  /** da dove vengono i numeri, in una riga, da mostrare a chi li legge */
  fonte: string;
  /** a quando si riferiscono (per esempio «2° semestre 2025») */
  aggiornamento: string;
};

export interface ProviderQuotazioni {
  /** il nome con cui si sceglie nella configurazione (QUOTAZIONI_PROVIDER) */
  readonly id: string;
  readonly origine: OrigineQuotazione;
  /**
   * La quotazione di una zona (il nome com'è nell'app, per esempio «Isola, Milano»), o
   * `null` se non la conosce. NON deve lanciare errori e riceve solo la zona: nessun
   * dato dell'annuncio o di chi lo scrive.
   */
  quotazione(zona: string): Promise<RisultatoQuotazione | null>;
}
