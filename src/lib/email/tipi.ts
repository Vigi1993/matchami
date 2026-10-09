/**
 * Le email: i tipi comuni a ogni fornitore di invio. Il resto dell'app parla
 * SOLO con questi tipi; chi sia il fornitore (uno vero o quello provvisorio) lo
 * sa soltanto `index.ts`. Scegliere un fornitore vuol dire scrivere un file che
 * rispetta `ProviderEmail` e registrarlo là: niente altro cambia.
 */

export type MessaggioEmail = {
  /** l'indirizzo del destinatario: lo conosce solo l'invio, non si salva da nessuna parte */
  a: string;
  oggetto: string;
  testo: string;
  html: string;
  /** per esempio List-Unsubscribe: i programmi di posta mostrano «annulla iscrizione» */
  intestazioni: Record<string, string>;
};

export type EsitoInvio =
  | { ok: true; idEsterno?: string }
  /**
   * `definitivo`: riprovare non servirebbe (un indirizzo che non esiste): le
   * notifiche si escludono subito. Altrimenti si riprova dopo un'ora, al massimo tre volte.
   */
  | { ok: false; errore: string; definitivo: boolean };

/** Come è stato "inviato": una copia di prova, o un servizio vero. */
export type OrigineEmail = "provvisoria" | "fornitore";

export interface ProviderEmail {
  /** il nome con cui si sceglie nella configurazione (EMAIL_PROVIDER) */
  readonly id: string;
  readonly origine: OrigineEmail;
  /**
   * Manda il messaggio. NON deve lanciare errori: li restituisce come esito.
   * `contesto.userId` serve solo al fornitore provvisorio per la copia di prova.
   */
  invia(messaggio: MessaggioEmail, contesto: { userId: string }): Promise<EsitoInvio>;
}

/** Ciò che l'invio chiede al fornitore per costruirsi (solo il provvisorio ne ha bisogno). */
export type DipendenzeEmail = {
  /** scrive una copia di prova: solo oggetto e testo, mai l'indirizzo */
  depositaProva: (userId: string, oggetto: string, testo: string) => Promise<void>;
};
