/**
 * Il contratto di locazione: i tipi comuni a ogni modello. Il resto dell'app parla
 * SOLO con questi tipi; quale modello sia (la bozza di prova, o uno validato da un
 * legale) lo sa soltanto `index.ts`. Scegliere un modello vuol dire scrivere un file che
 * rispetta `ModelloContratto` e registrarlo là: niente altro cambia.
 */

/** Una riga come la restituisce la funzione `dati_contratto` del database (tutto può mancare). */
export type RigaContratto = {
  contratto_id: string;
  stato: string;
  canone: number | null;
  durata_mesi: number | null;
  data_inizio: string | null;
  data_firma: string | null;
  titolo: string | null;
  zona: string | null;
  locali: number | null;
  mq: number | null;
  classe_energetica: string | null;
  ep_globale: number | string | null;
  via: string | null;
  civico: string | null;
  cap: string | null;
  citta: string | null;
  locatore_nome: string | null;
  locatore_cognome: string | null;
  conduttore_nome: string | null;
  conduttore_cognome: string | null;
  io_sono: string;
};

export type Parte = { nome: string | null; cognome: string | null };

/** I dati dell'affitto, già puliti. Ciò che non c'è è `null`: non si inventa mai. */
export type DatiContratto = {
  id: string;
  stato: string;
  locatore: Parte;
  conduttore: Parte;
  immobile: {
    titolo: string | null;
    zona: string | null;
    locali: number | null;
    mq: number | null;
    classeEnergetica: string | null;
    epGlobale: number | null;
    indirizzo: { via: string; civico: string; cap: string; citta: string } | null;
  };
  canone: number | null;
  durataMesi: number | null;
  /** AAAA-MM-GG */
  dataInizio: string | null;
  dataFirma: string | null;
  ioSono: "locatore" | "conduttore";
  /** almeno un testo era troppo lungo ed è stato abbreviato: il documento lo dice */
  troncato: boolean;
};

export type Sezione = { titolo: string; paragrafi: string[] };

export type DocumentoContratto = {
  titolo: string;
  sottotitolo: string | null;
  /** quale modello lo ha generato */
  modello: { id: string; versione: string; origine: OrigineModello };
  /** in cima al documento: per esempio «bozza di prova, nessun valore legale» */
  avvisi: string[];
  sezioni: Sezione[];
  firme: { ruolo: string; nome: string | null }[];
  /** i campi che nessuno ha ancora compilato, per dirlo a chi legge */
  daIndicare: string[];
  /**
   * Il documento è una BOZZA: lo decide il registro (`componiContratto`), non il modello, e
   * vale `true` per ogni modello che non sia stato registrato come validato da un legale.
   */
  bozza: boolean;
};

export type OrigineModello = "provvisorio" | "validato";

export interface ModelloContratto {
  /** il nome con cui si sceglie nella configurazione (CONTRATTO_MODELLO) */
  readonly id: string;
  readonly versione: string;
  readonly origine: OrigineModello;
  /** Solo per un modello VALIDATO: chi lo ha validato e quando. Senza, non si può registrare. */
  readonly validazione?: { da: string; data: string };
  /** Il documento. Funzione pura: nessuna richiesta, nessun accesso al database. */
  genera(dati: DatiContratto): Omit<DocumentoContratto, "modello" | "bozza">;
}
