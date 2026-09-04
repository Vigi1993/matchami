import { createClient } from "@/lib/supabase/server";
import { CandidatureClient } from "./CandidatureClient";
import type { CandidaturaConAnnuncio } from "@/lib/types";

export default async function CandidaturePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: candidature } = await supabase
    .from("candidature")
    .select("id, status, match_pct, created_at, listings(titolo, zona, prezzo, locali, mq)")
    .eq("tenant_id", user!.id)
    .order("created_at", { ascending: false });

  return (
    <CandidatureClient
      candidature={(candidature ?? []) as unknown as CandidaturaConAnnuncio[]}
    />
  );
}
