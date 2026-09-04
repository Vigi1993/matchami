import { createClient } from "@/lib/supabase/server";
import { GestioneClient } from "./GestioneClient";
import type { ContrattoConAnnuncio } from "@/lib/types";

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

  return (
    <GestioneClient contratti={(contratti ?? []) as unknown as ContrattoConAnnuncio[]} />
  );
}
