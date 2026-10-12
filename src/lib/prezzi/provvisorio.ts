/**
 * La fonte di quotazioni PROVVISORIA. I NUMERI SONO DI PROVA: inventati, plausibili ma
 * non reali. Servono a costruire e provare tutto il percorso (il consiglio che il
 * proprietario vede mentre sceglie il canone) prima di avere i dati veri
 * dell'Agenzia delle Entrate (OMI). Nessuno li deve prendere per veri: ogni volta che
 * compaiono, l'app lo dice (`fonte`).
 */
import type { ProviderQuotazioni, Quotazione, RisultatoQuotazione } from "./tipi";

/** Euro/m² al mese, per zona (il nome senza «, Milano»). DATI DI PROVA. */
export const QUOTAZIONI_DI_PROVA: Readonly<Record<string, Quotazione>> = {
  Navigli: { min: 22, max: 29 },
  Isola: { min: 23, max: 30 },
  "Porta Romana": { min: 21, max: 28 },
  "Città Studi": { min: 19, max: 25 },
  Bicocca: { min: 17, max: 22 },
  "Porta Nuova": { min: 25, max: 33 },
  "Porta Venezia": { min: 22, max: 29 },
  Sempione: { min: 21, max: 28 },
  Ticinese: { min: 22, max: 29 },
  Loreto: { min: 18, max: 24 },
  NoLo: { min: 17, max: 22 },
  Certosa: { min: 16, max: 21 },
  Lambrate: { min: 17, max: 22 },
};

export const FONTE_DI_PROVA = "Quotazioni di prova: non sono dati reali";

export const fornitoreProvvisorio: ProviderQuotazioni = {
  id: "provvisorio",
  origine: "provvisoria",
  async quotazione(zona: string): Promise<RisultatoQuotazione | null> {
    if (typeof zona !== "string") return null;
    const nome = zona.replace(/,\s*Milano\s*$/i, "").trim();
    // proprietà PROPRIA: «__proto__» o «constructor» esistono in ogni oggetto e non sono zone
    if (!Object.prototype.hasOwnProperty.call(QUOTAZIONI_DI_PROVA, nome)) return null;
    const q = QUOTAZIONI_DI_PROVA[nome];
    return { min: q.min, max: q.max, origine: "provvisoria", fonte: FONTE_DI_PROVA, aggiornamento: "dati di prova" };
  },
};
