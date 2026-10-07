import { createClient } from "@/lib/supabase/server";
import { DatabaseClient } from "./DatabaseClient";
import { criteriDaRighe } from "@/lib/match";
import type { CriterioRichiesto, RigaCriterioDb } from "@/lib/match";
import {
  assemblaCandidature,
  COLONNE_VISTA_CANDIDATI,
} from "@/lib/candidati";
import type { RigaCandidatura, RigaVistaCandidato } from "@/lib/candidati";

export default async function DatabasePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Le candidature ricevute sui miei annunci. I dati degli inquilini NON si
  // leggono più dalle loro tabelle: il database lascia al proprietario solo
  // la vista `candidati_del_proprietario`, con le colonne che servono (e dopo
  // un rifiuto, solo il nome).
  const { data: candidature } = await supabase
    .from("candidature")
    .select(
      "id, status, match_pct, created_at, tenant_id, listing_id, listings!inner(owner_id, titolo, zona, prezzo)"
    )
    .eq("listings.owner_id", user!.id)
    .order("created_at", { ascending: false });

  const righe = (candidature ?? []) as unknown as RigaCandidatura[];
  const tenantIds = [...new Set(righe.map((c) => c.tenant_id))];
  const listingIds = [...new Set(righe.map((c) => c.listing_id))];

  const [{ data: vista }, { data: valutazioni }, { data: righeCriteri }, { data: recensioni }] =
    await Promise.all([
      righe.length > 0
        ? supabase.from("candidati_del_proprietario").select(COLONNE_VISTA_CANDIDATI)
        : { data: [] },
      righe.length > 0
        ? supabase.from("valutazioni_candidati").select("candidatura_id, valutazione")
        : { data: [] },
      listingIds.length > 0
        ? supabase
            .from("listing_criteri")
            .select("listing_id, chiave, peso, modo, soglia_pct")
            .in("listing_id", listingIds)
        : { data: [] },
      tenantIds.length > 0
        ? supabase.from("recensioni").select("tenant_id, voto").in("tenant_id", tenantIds)
        : { data: [] },
    ]);

  const righePerListing = new Map<string, RigaCriterioDb[]>();
  for (const r of righeCriteri ?? []) {
    const id = r.listing_id as string;
    righePerListing.set(id, [...(righePerListing.get(id) ?? []), r as RigaCriterioDb]);
  }
  const criteriPerListing = new Map<string, CriterioRichiesto[]>(
    [...righePerListing].map(([id, rows]) => [id, criteriDaRighe(rows)])
  );

  const votiPerTenant = new Map<string, number[]>();
  for (const r of recensioni ?? []) {
    const id = r.tenant_id as string;
    votiPerTenant.set(id, [...(votiPerTenant.get(id) ?? []), r.voto as number]);
  }

  return (
    <DatabaseClient
      candidature={assemblaCandidature({
        candidature: righe,
        vista: (vista ?? []) as unknown as RigaVistaCandidato[],
        valutazioni: (valutazioni ?? []) as { candidatura_id: string; valutazione: unknown }[],
        criteriPerListing,
        votiPerTenant,
      })}
    />
  );
}
