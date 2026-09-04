import { createClient } from "@/lib/supabase/server";
import { HomeClient } from "./HomeClient";
import { OwnerHomeClient } from "./OwnerHomeClient";
import { computeAffidabilita } from "@/lib/affidabilita";
import type { TenantProfile, ListingConFoto, ListingProprietario } from "@/lib/types";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("ruolo")
    .eq("id", user!.id)
    .single();

  if (profile?.ruolo === "proprietario") {
    return <OwnerHome userId={user!.id} />;
  }

  return <TenantHome userId={user!.id} />;
}

async function TenantHome({ userId }: { userId: string }) {
  const supabase = await createClient();

  const [{ data: tenant }, { data: zoneRows }, { data: recensioni }, { data: giaCandidato }] =
    await Promise.all([
      supabase.from("tenant_profiles").select("*").eq("profile_id", userId).single(),
      supabase.from("tenant_zone_interesse").select("zona").eq("tenant_id", userId),
      supabase.from("recensioni").select("voto").eq("tenant_id", userId),
      supabase.from("candidature").select("listing_id").eq("tenant_id", userId),
    ]);

  const zone = (zoneRows ?? []).map((r) => r.zona as string);
  const numeroRecensioni = recensioni?.length ?? 0;
  const mediaRecensioni =
    numeroRecensioni > 0
      ? recensioni!.reduce((s, r) => s + (r.voto as number), 0) / numeroRecensioni
      : null;

  const tenantProfile = tenant as TenantProfile;

  const affidabilita = computeAffidabilita({
    verificato: tenantProfile.verificato,
    protestato: tenantProfile.protestato,
    garante: tenantProfile.garante,
    fideiussione: tenantProfile.fideiussione,
    professione: tenantProfile.professione,
    reddito_mensile: tenantProfile.reddito_mensile,
    mediaRecensioni,
    numeroRecensioni,
  });

  // ---- Costruisco la query "case in linea con la tua ricerca" ----
  // Stessa logica del prototipo (listingsAfterFilters): budget, locali,
  // metratura minima e zone preferite. Se non ci sono ancora annunci nel
  // database, questa query restituisce semplicemente 0 risultati — è il
  // comportamento corretto, non un errore.
  let query = supabase
    .from("listings")
    .select("id, titolo, zona, prezzo, locali, mq, descrizione, listing_photos(url)")
    .eq("pubblicato", true);

  if (tenantProfile.budget_max) query = query.lte("prezzo", tenantProfile.budget_max);
  if (tenantProfile.locali_min) query = query.gte("locali", tenantProfile.locali_min);
  if (tenantProfile.mq_min) query = query.gte("mq", tenantProfile.mq_min);
  if (zone.length > 0) query = query.in("zona", zone);

  const listingIdsEsclusi = (giaCandidato ?? []).map((c) => c.listing_id as string);
  if (listingIdsEsclusi.length > 0) {
    query = query.not("id", "in", `(${listingIdsEsclusi.join(",")})`);
  }

  const { data: listings } = await query.order("created_at", { ascending: false });

  return (
    <HomeClient
      affidabilita={affidabilita}
      listings={(listings ?? []) as unknown as ListingConFoto[]}
    />
  );
}

async function OwnerHome({ userId }: { userId: string }) {
  const supabase = await createClient();

  const [{ data: listings }, { data: candidature }] = await Promise.all([
    supabase
      .from("listings")
      .select("id, titolo, zona, prezzo, pubblicato")
      .eq("owner_id", userId)
      .order("created_at", { ascending: false }),
    supabase
      .from("candidature")
      .select("id, status, listing_id, listings!inner(owner_id)")
      .eq("listings.owner_id", userId),
  ]);

  const nCandidaturePerListing = new Map<string, number>();
  for (const c of candidature ?? []) {
    const id = c.listing_id as string;
    nCandidaturePerListing.set(id, (nCandidaturePerListing.get(id) ?? 0) + 1);
  }

  const listingsConConteggio: ListingProprietario[] = (listings ?? []).map((l) => ({
    id: l.id,
    titolo: l.titolo,
    zona: l.zona,
    prezzo: l.prezzo,
    pubblicato: l.pubblicato,
    nCandidature: nCandidaturePerListing.get(l.id) ?? 0,
  }));

  const totaleCandidature = candidature?.length ?? 0;
  const daValutare = (candidature ?? []).filter((c) => c.status === "in_attesa").length;

  return (
    <OwnerHomeClient
      listings={listingsConConteggio}
      totaleCandidature={totaleCandidature}
      daValutare={daValutare}
    />
  );
}
