/**
 * La firma del contratto: i tipi comuni a ogni servizio di firma. Il resto dell'app parla SOLO con questi
 * tipi; quale servizio sia (quello di prova, o uno vero) lo sa soltanto `index.ts`.
 *
 * ATTENZIONE, per chi collegherà un servizio vero: questa interfaccia descrive una firma IMMEDIATA (si chiama,
 * risponde «fatto»). Un servizio vero è quasi sempre in due tempi (si manda la persona su una pagina del
 * servizio, e il servizio avvisa a firma avvenuta): servirà estenderla, e ci vorrà una MIGRAZIONE con una funzione
 * riservata al ruolo di servizio che registri la firma e, solo allora, porti il contratto a «firmato». Le funzioni
 * di oggi non possono né scrivere una firma vera né cambiare lo stato del contratto: è voluto.
 */

export type RichiestaFirma = {
  contrattoId: string;
  /** l'impronta (SHA-256 in esadecimale) del testo che si firma */
  impronta: string;
  /** chi firma */
  firmatario: string;
};

export type EsitoFirma =
  | { ok: true; idEsterno?: string }
  | { ok: false; errore: string; definitivo: boolean };

export type OrigineFirma = "provvisoria" | "fornitore";

export interface ProviderFirma {
  /** il nome con cui si sceglie nella configurazione (FIRMA_PROVIDER) */
  readonly id: string;
  readonly origine: OrigineFirma;
  /** NON deve lanciare errori: li restituisce come esito. */
  firma(richiesta: RichiestaFirma): Promise<EsitoFirma>;
}

/** Una firma come la restituisce `firme_dei_miei_contratti` (mai l'identificativo della persona). */
export type FirmaContratto = {
  contratto_id: string;
  ruolo: "locatore" | "conduttore";
  origine: OrigineFirma;
  impronta: string;
  firmata_at: string;
  /** l'ho firmata io */
  mia: boolean;
};
