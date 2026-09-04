import { createClient } from "@/lib/supabase/server";
import { GestioneAffittiClient } from "./GestioneAffittiClient";
import type { CandidaturaSenzaContratto, ContrattoProprietario } from "@/lib/types";

export default async function GestioneAffittiPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Candidature accettate sui miei annunci
  const { data: accettate } = await supabase
    .from("candidature")
    .select("id, tenant_id, listings!inner(owner_id, titolo, zona)")
    .eq("listings.owner_id", user!.id)
    .eq("status", "accettata");

  // Contratti già esistenti, per capire quali candidature ne sono ancora prive
  const { data: contratti } = await supabase
    .from("contratti")
    .select(
      "id, candidatura_id, stato, canone, durata_mesi, data_inizio, data_firma, candidature!inner(listing_id, tenant_id, listings(owner_id, titolo, zona))"
    )
    .eq("candidature.listings.owner_id", user!.id)
    .order("created_at", { ascending: false });

  const candidatureConContratto = new Set(
    (contratti ?? []).map((c) => c.candidatura_id as string)
  );
  const senzaContratto = (accettate ?? []).filter(
    (c) => !candidatureConContratto.has(c.id)
  );

  // nomi/cognomi degli inquilini coinvolti (candidature senza contratto)
  const tenantIds = [...new Set(senzaContratto.map((c) => c.tenant_id as string))];
  const { data: profiliSenza } =
    tenantIds.length > 0
      ? await supabase.from("profiles").select("id, nome, cognome").in("id", tenantIds)
      : { data: [] };
  const nomiSenzaContratto = new Map(
    (profiliSenza ?? []).map((p) => [p.id as string, { nome: p.nome, cognome: p.cognome }])
  );

  const candidatureSenzaContratto: CandidaturaSenzaContratto[] = senzaContratto.map(
    (c) => ({
      id: c.id,
      listings: c.listings as unknown as { titolo: string; zona: string },
      nome: nomiSenzaContratto.get(c.tenant_id as string)?.nome ?? null,
      cognome: nomiSenzaContratto.get(c.tenant_id as string)?.cognome ?? null,
    })
  );

  // nomi/cognomi per i contratti esistenti
  const tenantIdsContratti = [
    ...new Set(
      (contratti ?? []).map(
        (c) => (c.candidature as unknown as { tenant_id: string })?.tenant_id
      )
    ),
  ].filter(Boolean) as string[];
  const { data: profiliContratti } =
    tenantIdsContratti.length > 0
      ? await supabase.from("profiles").select("id, nome, cognome").in("id", tenantIdsContratti)
      : { data: [] };
  const nomiContratti = new Map(
    (profiliContratti ?? []).map((p) => [p.id as string, { nome: p.nome, cognome: p.cognome }])
  );

  const contrattiCompleti: ContrattoProprietario[] = (
    (contratti ?? []) as unknown as ContrattoProprietario[]
  ).map((c) => {
    const tenantId = c.candidature?.tenant_id ?? "";
    return {
      ...c,
      nome: nomiContratti.get(tenantId)?.nome ?? null,
      cognome: nomiContratti.get(tenantId)?.cognome ?? null,
    };
  });

  return (
    <GestioneAffittiClient
      candidatureSenzaContratto={candidatureSenzaContratto}
      contratti={contrattiCompleti}
    />
  );
}
