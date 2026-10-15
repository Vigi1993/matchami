import { createClient } from "@/lib/supabase/server";
import { CandidatureClient } from "./CandidatureClient";
import type { CandidaturaConAnnuncio } from "@/lib/types";
import { richiestaDaRiga, type RichiestaPerInquilino } from "@/lib/richieste";
import { schedaMatchDaParametro } from "@/lib/candidature";

export default async function CandidaturePage({ searchParams }: { searchParams: Promise<{ scheda?: string | string[] }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: candidature }, { data: richieste }, { data: profilo }] = await Promise.all([
    supabase
      .from("candidature")
      .select("id, status, match_pct, motivo_rifiuto, origine, created_at, listings(titolo, zona, prezzo, locali, mq)")
      .eq("tenant_id", user!.id)
      .order("created_at", { ascending: false }),
    // le richieste dei proprietari, con la casa e le sue foto
    supabase
      .from("richieste_proprietari")
      .select("id, stato, messaggio, nome_proprietario, candidatura_id, created_at, listings(titolo, zona, prezzo, locali, mq, listing_photos(url, ordine))")
      .eq("tenant_id", user!.id)
      .order("created_at", { ascending: false }),
    supabase.from("tenant_profiles").select("visibile_ai_proprietari").eq("profile_id", user!.id).single(),
  ]);

  const lista = (richieste ?? []).map(richiestaDaRiga).filter((r): r is RichiestaPerInquilino => r !== null);

  return (
    <CandidatureClient
      candidature={(candidature ?? []) as unknown as CandidaturaConAnnuncio[]}
      richieste={lista}
      visibile={profilo?.visibile_ai_proprietari === true}
      schedaIniziale={schedaMatchDaParametro((await searchParams).scheda)}
    />
  );
}
