import { createClient } from "@/lib/supabase/server";
import { DatabaseClient } from "./DatabaseClient";
import {
  criteriDaRighe,
  leggiFotografia,
  valutaCandidato,
} from "@/lib/match";
import type { CriterioRichiesto, ProfiloCandidato, RigaCriterioDb } from "@/lib/match";
import type { CandidaturaRicevuta } from "@/lib/types";

export default async function DatabasePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Candidature ricevute sugli annunci di questo proprietario, con i dati
  // dell'inquilino che la sicurezza del database gli lascia leggere
  // (policy "tenant_profiles: owner reads applicants"). Le zone e le
  // caratteristiche desiderate NON sono tra questi: restano dell'inquilino.
  const { data: candidature } = await supabase
    .from("candidature")
    .select(
      "id, status, match_pct, created_at, tenant_id, listing_id, match_proprietario, listings!inner(owner_id, titolo, zona, prezzo), tenant_profiles!inner(professione, reddito_mensile, reddito_nucleo, garante, fideiussione, protestato, animali, nucleo, verificato, presentazione, avatar_url)"
    )
    .eq("listings.owner_id", user!.id)
    .order("created_at", { ascending: false });

  const righe = candidature ?? [];
  const tenantIds = [...new Set(righe.map((c) => c.tenant_id as string))];
  const listingIds = [...new Set(righe.map((c) => c.listing_id as string))];

  // Nome e cognome (migrazione 0003), criteri richiesti per annuncio e
  // recensioni di ciascun inquilino (per l'affidabilità).
  const [{ data: profili }, { data: righeCriteri }, { data: recensioni }] =
    await Promise.all([
      tenantIds.length > 0
        ? supabase.from("profiles").select("id, nome, cognome").in("id", tenantIds)
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

  const nomiPerTenant = new Map(
    (profili ?? []).map((p) => [p.id as string, { nome: p.nome, cognome: p.cognome }])
  );

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

  const candidatureComplete: CandidaturaRicevuta[] = righe.map((c) => {
    const listing = c.listings as unknown as { prezzo: number } | null;
    const profilo = c.tenant_profiles as unknown as ProfiloCandidato;
    const voti = votiPerTenant.get(c.tenant_id as string) ?? [];

    // Finché la candidatura è in attesa il match si ricalcola sui dati
    // attuali. Dopo la decisione si mostra la fotografia scattata in quel
    // momento (se è leggibile; altrimenti si ricalcola).
    const fotografia =
      c.status !== "in_attesa" ? leggiFotografia(c.match_proprietario) : null;

    const valutazione = fotografia
      ? { ...fotografia, congelata: true }
      : {
          ...valutaCandidato({
            criteri: criteriPerListing.get(c.listing_id as string) ?? [],
            canone: listing?.prezzo ?? 0,
            profilo,
            mediaRecensioni:
              voti.length > 0 ? voti.reduce((a, b) => a + b, 0) / voti.length : null,
            numeroRecensioni: voti.length,
          }),
          congelata: false,
        };

    // `match_proprietario` grezzo non serve al client
    const { match_proprietario: _grezzo, ...resto } = c as typeof c & {
      match_proprietario: unknown;
    };
    void _grezzo;

    return {
      ...(resto as unknown as CandidaturaRicevuta),
      nome: nomiPerTenant.get(c.tenant_id as string)?.nome ?? null,
      cognome: nomiPerTenant.get(c.tenant_id as string)?.cognome ?? null,
      valutazione,
    };
  });

  return <DatabaseClient candidature={candidatureComplete} />;
}
