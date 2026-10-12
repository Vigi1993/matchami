import { autorizzaCron } from "@/lib/email/cron";
import { svuotaCodaFile } from "@/lib/archivio";
import { clienteAmministratore } from "@/lib/supabase/admin";

/**
 * Toglie dall'archivio i file dei documenti che non esistono più (un contratto cancellato,
 * un account eliminato). Si svuota da sola dopo ogni cancellazione; questo giro periodico riprende
 * ciò che per un errore fosse rimasto. Lo chiama lo scheduler con `Authorization: Bearer <CRON_SECRET>`,
 * lo stesso segreto dell'invio delle email. Senza il segreto non fa niente.
 */
export const dynamic = "force-dynamic";

function risposta(stato: number, corpo: unknown): Response {
  return Response.json(corpo, { status: stato, headers: { "Cache-Control": "no-store" } });
}

async function gestisci(richiesta: Request): Promise<Response> {
  const esito = autorizzaCron(richiesta.headers.get("authorization"), process.env.CRON_SECRET);
  if (esito === "non_configurato") return risposta(503, { errore: "Non configurato (manca CRON_SECRET)." });
  if (esito === "rifiutato") return risposta(401, { errore: "Non autorizzato." });

  const admin = clienteAmministratore();
  if (!admin) return risposta(500, { errore: "La chiave di servizio non è configurata." });

  const riepilogo = await svuotaCodaFile(admin);
  return risposta(riepilogo.errori > 0 && riepilogo.rimossi === 0 && riepilogo.letti > 0 ? 500 : 200, riepilogo);
}

export const GET = gestisci;
export const POST = gestisci;
