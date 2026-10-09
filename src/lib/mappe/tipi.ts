/**
 * Le mappe: i tipi comuni a ogni fornitore. Il resto dell'app parla SOLO con
 * questi tipi; chi sia il fornitore (uno vero, o quello provvisorio) lo sa
 * soltanto `index.ts`. Scegliere un fornitore vuol dire scrivere un file che
 * rispetta `ProviderMappe` e registrarlo là: niente altro cambia.
 */

export type Indirizzo = {
  via: string;
  civico: string;
  cap: string;
  citta: string;
};

export type Posizione = {
  latitudine: number;
  longitudine: number;
};

/**
 * Come è stata ottenuta una posizione. `provvisoria` è un calcolo di prova, non
 * un indirizzo vero trovato su una mappa: quando si sceglierà un fornitore, le
 * posizioni provvisorie si riconoscono (e si ricalcolano) da questo campo.
 */
export type OrigineePosizione = "provvisoria" | "fornitore";

/** Come si mostra la mappa. Il fornitore sceglie il modo; chi la disegna lo segue. */
export type VistaMappa =
  /** un disegno segnaposto: nessuna richiesta a servizi esterni */
  | { tipo: "provvisoria"; etichetta: string }
  /** una mappa dentro un riquadro (iframe) */
  | { tipo: "incorporata"; url: string; titolo: string }
  /** un'immagine statica della mappa */
  | { tipo: "immagine"; url: string; alt: string };

export interface ProviderMappe {
  /** il nome con cui si sceglie nella configurazione (MAPPE_PROVIDER) */
  readonly id: string;
  /** l'origine che si scrive nel database insieme alla posizione */
  readonly origine: OrigineePosizione;
  /**
   * La posizione di un indirizzo, o `null` se non si trova. `contesto.zona` è la
   * zona dell'annuncio (per esempio «Isola, Milano»): un fornitore vero può
   * ignorarla, quello provvisorio la usa.
   */
  geocodifica(indirizzo: Indirizzo, contesto?: { zona?: string | null }): Promise<Posizione | null>;
  /** Come mostrare la mappa di una posizione. Funzione pura: nessuna richiesta. */
  vistaMappa(posizione: Posizione, indirizzo: Indirizzo): VistaMappa;
}

/**
 * Un indirizzo con la mappa già pronta. La vista la sceglie il SERVER (conosce il
 * fornitore); i componenti la ricevono già fatta e la disegnano. `vista` è nulla
 * se il fornitore non è configurato bene: si mostra comunque l'indirizzo in testo.
 */
export type IndirizzoConVista = {
  indirizzo: Indirizzo;
  origine: OrigineePosizione;
  vista: VistaMappa | null;
};
