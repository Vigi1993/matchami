/**
 * Il servizio di firma PROVVISORIO. Non firma niente di vero: risponde «fatto» e basta. Serve a provare tutto il
 * percorso (chi firma, quando, che cosa, e cosa succede se il contratto cambia dopo) prima di scegliere un
 * servizio. La firma che ne esce NON HA VALORE LEGALE e non rende il contratto «firmato».
 */
import type { EsitoFirma, ProviderFirma, RichiestaFirma } from "./tipi";

export const fornitoreFirmaProvvisorio: ProviderFirma = {
  id: "provvisorio",
  origine: "provvisoria",
  async firma(richiesta: RichiestaFirma): Promise<EsitoFirma> {
    return /^[0-9a-f]{64}$/.test(richiesta?.impronta ?? "") ? { ok: true } : { ok: false, errore: "Impronta non valida.", definitivo: true };
  },
};
