/**
 * Il fornitore di email PROVVISORIO. Non manda niente: scrive una copia di prova
 * (solo oggetto e testo) in un registro che lo staff può leggere. Serve a
 * costruire e provare tutto il percorso — scegliere chi riceve, comporre,
 * riprovare, disattivare — prima di scegliere un servizio vero.
 *
 * L'indirizzo del destinatario NON si scrive nella copia: non serve a nessuno.
 */
import type { EsitoInvio, MessaggioEmail, ProviderEmail } from "./tipi";

export function creaFornitoreProvvisorio(
  deposita: (userId: string, oggetto: string, testo: string) => Promise<void>
): ProviderEmail {
  return {
    id: "provvisorio",
    origine: "provvisoria",
    async invia(messaggio: MessaggioEmail, contesto: { userId: string }): Promise<EsitoInvio> {
      try {
        await deposita(contesto.userId, messaggio.oggetto, messaggio.testo);
        return { ok: true };
      } catch {
        // un errore del deposito si può riprovare: il testo dell'errore non serve a nessuno
        return { ok: false, errore: "Non è stato possibile salvare la copia di prova.", definitivo: false };
      }
    },
  };
}
