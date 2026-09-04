import { createClient } from "@/lib/supabase/server";
import { DatabaseClient } from "./DatabaseClient";
import type { CandidaturaRicevuta } from "@/lib/types";

export default async function DatabasePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Query 1: candidature ricevute sugli annunci di questo proprietario,
  // con i dati economici dell'inquilino (permesso dalla policy
  // "tenant_profiles: owner reads applicants").
  const { data: candidature } = await supabase
    .from("candidature")
    .select(
      "id, status, match_pct, created_at, tenant_id, listings!inner(owner_id, titolo, zona), tenant_profiles!inner(professione, reddito_mensile, verificato, presentazione)"
    )
    .eq("listings.owner_id", user!.id)
    .order("created_at", { ascending: false });

  // Query 2: nome/cognome degli inquilini (permesso dalla policy
  // "profiles: owner reads applicant profile", vedi migrazione 0003).
  const tenantIds = [...new Set((candidature ?? []).map((c) => c.tenant_id))];
  const { data: profili } =
    tenantIds.length > 0
      ? await supabase.from("profiles").select("id, nome, cognome").in("id", tenantIds)
      : { data: [] };

  const nomiPerTenant = new Map(
    (profili ?? []).map((p) => [p.id as string, { nome: p.nome, cognome: p.cognome }])
  );

  const candidatureComplete: CandidaturaRicevuta[] = (
    (candidature ?? []) as unknown as CandidaturaRicevuta[]
  ).map((c) => ({
    ...c,
    nome: nomiPerTenant.get(c.tenant_id)?.nome ?? null,
    cognome: nomiPerTenant.get(c.tenant_id)?.cognome ?? null,
  }));

  return <DatabaseClient candidature={candidatureComplete} />;
}
