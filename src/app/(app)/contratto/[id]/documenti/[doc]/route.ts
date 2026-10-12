import { createClient } from "@/lib/supabase/server";
import { clienteAmministratore } from "@/lib/supabase/admin";
import { INFORMATIVA } from "@/content/informativa";
import { haAccettatoInformativa, versioniAccettabili } from "@/lib/informativa";
import { BUCKET_DOCUMENTI_CONTRATTO, nomeDaScaricare } from "@/lib/documenti-contratto";
import { èUuid } from "@/lib/uuid";

/**
 * Scarica un documento di un contratto. È l'UNICO punto in cui una persona arriva a un file
 * caricato da un'altra: l'archivio non concede a nessuno di leggere i file altrui, quindi qui
 * si chiede prima al database «sei una delle due parti di questo contratto?» e solo se sì il server
 * scarica il file con i suoi permessi.
 *
 * Il file si serve SEMPRE come scaricamento (mai aperto dentro la pagina), con il tipo registrato
 * al caricamento e il divieto di indovinarne un altro: un file caricato da altri non deve poter
 * eseguire niente nel browser di chi lo apre.
 */
export const dynamic = "force-dynamic";

const TIPI_AMMESSI: Record<string, string> = { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" };

function testo(stato: number, messaggio: string): Response {
  return new Response(messaggio, { status: stato, headers: { "Cache-Control": "private, no-store", "Content-Type": "text/plain; charset=utf-8" } });
}

export async function GET(_richiesta: Request, { params }: { params: Promise<{ id: string; doc: string }> }): Promise<Response> {
  const { id, doc } = await params;
  if (!èUuid(id) || !èUuid(doc)) return testo(404, "Documento non trovato.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return testo(401, "Non autenticato.");

  if (!(await haAccettatoInformativa(supabase, user.id, versioniAccettabili(INFORMATIVA)))) {
    return testo(403, "Accetta l'informativa per continuare.");
  }

  // solo per le due parti: per chiunque altro, nessuna riga (e la stessa risposta di un documento inesistente)
  const { data, error } = await supabase.rpc("percorso_documento_contratto", { p_documento: doc });
  if (error) return testo(500, "Non è stato possibile leggere il documento.");
  const riga = (Array.isArray(data) ? data[0] : null) as { contratto_id: string; percorso: string; nome_file: string; tipo_file: string } | null;
  // anche l'identificativo del contratto nell'indirizzo deve essere quello giusto
  if (!riga || riga.contratto_id !== id) return testo(404, "Documento non trovato.");

  const estensione = TIPI_AMMESSI[riga.tipo_file];
  if (!estensione) return testo(500, "Il documento non è in un formato ammesso.");

  const admin = clienteAmministratore();
  if (!admin) return testo(503, "L'archivio dei documenti non è ancora attivo su questo ambiente.");

  const { data: blob, error: eFile } = await admin.storage.from(BUCKET_DOCUMENTI_CONTRATTO).download(riga.percorso);
  if (eFile || !blob) return testo(404, "Il file non è più disponibile.");

  const nome = nomeDaScaricare(riga.nome_file, estensione);
  const corpo = await blob.arrayBuffer();
  return new Response(corpo, {
    status: 200,
    headers: {
      "Content-Type": riga.tipo_file,
      "Content-Length": String(corpo.byteLength),
      "Content-Disposition": `attachment; filename="${nome.ascii}"; filename*=UTF-8''${nome.utf8}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
}
