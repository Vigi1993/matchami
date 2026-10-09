import { autorizzaCron } from "@/lib/email/cron";
import { eseguiInvioDaAmbiente } from "@/lib/email/servizio";

/**
 * L'invio periodico delle email per le notifiche. Lo chiama uno scheduler (Vercel
 * Cron, o un servizio esterno ogni 10 minuti circa) con l'intestazione
 * `Authorization: Bearer <CRON_SECRET>`. Senza il segreto non fa niente: un indirizzo
 * che manda email non può essere aperto a chiunque.
 *
 * Variabili d'ambiente:
 *   CRON_SECRET     il segreto (almeno 16 caratteri). Se manca, l'invio è spento.
 *   APP_URL         l'indirizzo dell'app per i link nelle email (https://...).
 *                   Se manca si usa quello della richiesta.
 *   EMAIL_PROVIDER  il fornitore (vuoto o «provvisorio» finché non se ne sceglie uno).
 */
export const dynamic = "force-dynamic";

function risposta(stato: number, corpo: unknown): Response {
  return Response.json(corpo, { status: stato, headers: { "Cache-Control": "no-store" } });
}

async function gestisci(richiesta: Request): Promise<Response> {
  const esito = autorizzaCron(richiesta.headers.get("authorization"), process.env.CRON_SECRET);
  if (esito === "non_configurato") return risposta(503, { errore: "L'invio non è configurato (manca CRON_SECRET)." });
  if (esito === "rifiutato") return risposta(401, { errore: "Non autorizzato." });

  const urlApp = process.env.APP_URL || new URL(richiesta.url).origin;
  const riepilogo = await eseguiInvioDaAmbiente(urlApp);
  return risposta(riepilogo.fermato ? 500 : 200, riepilogo);
}

// Lo scheduler di Vercel usa GET; un servizio esterno può usare POST.
export const GET = gestisci;
export const POST = gestisci;
