import { createClient } from "@/lib/supabase/server";
import { GestioneClient } from "./GestioneClient";
import { sezioneGestione } from "@/lib/gestione";
import type { ContrattoConAnnuncio } from "@/lib/types";
import { raggruppaPerContratto, type DocumentoContratto } from "@/lib/documenti-contratto";
import { caricaFirme } from "@/lib/firma/carica";
import { RapportiPanel } from "@/components/RapportiPanel";
import { caricaRapportiMiei } from "@/lib/rapporti-server";
import type { Invito } from "@/lib/types";

export default async function GestionePage({ searchParams }: { searchParams: Promise<{ apri?: string | string[] }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // RLS fa già il filtro giusto (solo i contratti dove sei una delle due
  // parti), ma filtriamo comunque esplicitamente per chiarezza della query.
  const { data: contratti } = await supabase
    .from("contratti")
    .select(
      "id, stato, canone, durata_mesi, data_inizio, data_firma, inquilino_conferma_at, inquilino_rifiuta_at, candidature!inner(tenant_id, listings(titolo, zona))"
    )
    .eq("candidature.tenant_id", user!.id)
    .order("created_at", { ascending: false });

  // I documenti di TUTTI i miei contratti, in una chiamata sola (mai il percorso dei file)
  const { data: documenti } = await supabase.rpc("documenti_dei_miei_contratti");

  // Le firme di prova, con l'impronta del documento di oggi per i contratti che ne hanno
  const firme = await caricaFirme(supabase);

  // Gli affitti dichiarati (con le richieste di conferma) e gli inviti al proprietario: prima stavano nel Profilo
  const [{ data: inviti }, { data: profilo }, rapporti] = await Promise.all([
    supabase
      .from("inviti_proprietario")
      .select("id, token, nome_proprietario, email_proprietario, indirizzo, periodo, stato, created_at")
      .eq("tenant_id", user!.id)
      .order("created_at", { ascending: false }),
    supabase.from("profiles").select("nome").eq("id", user!.id).single(),
    caricaRapportiMiei(supabase, user!.id),
  ]);

  return (
    <GestioneClient
      aperturaIniziale={sezioneGestione((await searchParams).apri)}
      nomeInquilino={profilo?.nome ?? null}
      inviti={(inviti ?? []) as Invito[]}
      affittiPanel={
        <RapportiPanel
          ruolo="inquilino"
          nomeCreatore={rapporti.nome}
          richieste={rapporti.richieste}
          rapporti={rapporti.rapporti}
        />
      }
      contratti={(contratti ?? []) as unknown as ContrattoConAnnuncio[]}
      firme={firme}
      documenti={raggruppaPerContratto((documenti ?? []) as DocumentoContratto[])}
    />
  );
}
