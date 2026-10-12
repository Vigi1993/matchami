import { createClient } from "@/lib/supabase/server";
import { GestioneClient } from "./GestioneClient";
import type { ContrattoConAnnuncio } from "@/lib/types";
import { raggruppaPerContratto, type DocumentoContratto } from "@/lib/documenti-contratto";

export default async function GestionePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // RLS fa già il filtro giusto (solo i contratti dove sei una delle due
  // parti), ma filtriamo comunque esplicitamente per chiarezza della query.
  const { data: contratti } = await supabase
    .from("contratti")
    .select(
      "id, stato, canone, durata_mesi, data_inizio, data_firma, candidature!inner(tenant_id, listings(titolo, zona))"
    )
    .eq("candidature.tenant_id", user!.id)
    .order("created_at", { ascending: false });

  // I documenti di TUTTI i miei contratti, in una chiamata sola (mai il percorso dei file)
  const { data: documenti } = await supabase.rpc("documenti_dei_miei_contratti");

  return (
    <GestioneClient
      contratti={(contratti ?? []) as unknown as ContrattoConAnnuncio[]}
      documenti={raggruppaPerContratto((documenti ?? []) as DocumentoContratto[])}
    />
  );
}
