import { tokenValido } from "@/lib/email/modello";
import { clienteAmministratore } from "@/lib/supabase/admin";

/**
 * «Annulla iscrizione» con un clic (RFC 8058): i programmi di posta mandano una
 * richiesta POST a questo indirizzo, senza accedere. Solo POST: un GET (che molti
 * antivirus e anteprime di posta fanno da soli, su ogni link) NON deve disattivare
 * niente. Il codice è lungo e casuale: chi lo conosce può solo disattivare le email.
 */
export const dynamic = "force-dynamic";

export async function POST(_richiesta: Request, { params }: { params: Promise<{ token: string }> }): Promise<Response> {
  const { token } = await params;
  if (!tokenValido(token)) return new Response("Codice non valido.", { status: 400 });

  const admin = clienteAmministratore();
  if (!admin) return new Response("Servizio non disponibile.", { status: 503 });

  const { error } = await admin.rpc("disiscrivi_email", { p_token: token });
  if (error) return new Response("Non è stato possibile completare l'operazione.", { status: 500 });

  // la stessa risposta se il codice esiste o no: non si lascia capire quali sono validi
  return new Response("Non riceverai più queste email.", { status: 200 });
}
