import { createClient } from "@/lib/supabase/server";
import { INFORMATIVA } from "@/content/informativa";
import { haAccettatoInformativa, versioniAccettabili } from "@/lib/informativa";
import { componiContratto } from "@/lib/contratto";
import { datiDaRiga } from "@/lib/contratto/dati";
import { generaPdf } from "@/lib/contratto/pdf";
import type { RigaContratto } from "@/lib/contratto/tipi";

/**
 * Scarica il PDF della bozza del contratto. Lo possono scaricare solo le due parti (lo decide
 * la funzione del database, non questo codice) e solo dopo aver accettato l'informativa, come
 * per le pagine dell'app. Il PDF si compone al momento e NON si salva da nessuna parte.
 *
 * Il nome del file non contiene nomi di persone: solo l'inizio dell'identificativo.
 */
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function testo(stato: number, messaggio: string): Response {
  return new Response(messaggio, { status: stato, headers: { "Cache-Control": "private, no-store", "Content-Type": "text/plain; charset=utf-8" } });
}

export async function GET(_richiesta: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  if (!UUID.test(id)) return testo(404, "Contratto non trovato.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return testo(401, "Non autenticato.");

  if (!(await haAccettatoInformativa(supabase, user.id, versioniAccettabili(INFORMATIVA)))) {
    return testo(403, "Accetta l'informativa per continuare.");
  }

  // la funzione risponde solo alle due parti di un contratto con candidatura accettata: per chiunque altro, nessuna riga
  const { data, error } = await supabase.rpc("dati_contratto", { p_contratto: id });
  if (error) return testo(500, "Non è stato possibile preparare il documento.");

  const dati = datiDaRiga((Array.isArray(data) ? data[0] : null) as Partial<RigaContratto> | null);
  if (!dati) return testo(404, "Contratto non trovato.");

  let documento;
  try {
    documento = componiContratto(dati);
  } catch {
    return testo(500, "Il modello di contratto non è configurato correttamente.");
  }

  const bytes = await generaPdf(documento);
  return new Response(bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${documento.bozza ? "contratto-bozza" : "contratto"}-${id.slice(0, 8)}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
