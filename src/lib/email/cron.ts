/**
 * Chi può far partire l'invio. Un indirizzo che manda email non può essere aperto
 * a chiunque: richiede un segreto, che lo scheduler (Vercel Cron o un servizio
 * esterno) manda nell'intestazione `Authorization: Bearer <segreto>`.
 */
import { timingSafeEqual } from "node:crypto";

export type EsitoAutorizzazione = "ok" | "non_configurato" | "rifiutato";

/** Un segreto troppo corto non protegge niente: si tratta come «non configurato». */
export const LUNGHEZZA_MINIMA_SEGRETO = 16;

export function autorizzaCron(intestazione: string | null | undefined, segreto: string | null | undefined): EsitoAutorizzazione {
  if (typeof segreto !== "string" || segreto.length < LUNGHEZZA_MINIMA_SEGRETO) return "non_configurato";
  if (typeof intestazione !== "string") return "rifiutato";

  const m = intestazione.match(/^Bearer (.+)$/);
  if (!m) return "rifiutato";

  // confronto a tempo costante, e solo tra stringhe della stessa lunghezza
  const dato = Buffer.from(m[1]);
  const atteso = Buffer.from(segreto);
  if (dato.length !== atteso.length) return "rifiutato";
  return timingSafeEqual(dato, atteso) ? "ok" : "rifiutato";
}
