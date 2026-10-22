import { autorizzaCron } from "@/lib/email/cron";
import { clienteAmministratore } from "@/lib/supabase/admin";

/**
 * I PROMEMORIA di scadenza delle verifiche: chi ha una verifica (reddito o protesti) in scadenza tra 30 giorni, tra 7 giorni, o appena scaduta, riceve una notifica
 * (che arriva anche per email, nel riepilogo). Una sola volta per scadenza: la funzione del database lo ricorda. Lo chiama lo scheduler una volta al giorno con
 * `Authorization: Bearer <CRON_SECRET>`, lo stesso segreto dell'invio delle email e della pulizia dell'archivio. Senza il segreto non fa niente.
 *
 * Importante: la SCADENZA vale comunque, anche se questo lavoro non gira (si calcola quando si legge il dato). Questo serve solo ad avvisare in tempo.
 * Risponde solo con quanti promemoria ha creato: mai nomi né dati delle persone.
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

  const { data, error } = await admin.rpc("promemoria_scadenze_verifiche");
  if (error) {
    console.error("promemoria scadenze: non riuscito:", error.message);
    return risposta(500, { errore: "Non sono riuscito a creare i promemoria." });
  }
  return risposta(200, { creati: typeof data === "number" ? data : 0 });
}

export const GET = gestisci;
export const POST = gestisci;
