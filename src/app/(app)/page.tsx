import { createClient } from "@/lib/supabase/server";
import { HomeClient } from "./HomeClient";
import { OwnerHomeClient } from "./OwnerHomeClient";
import { computeAffidabilita } from "@/lib/affidabilita";
import { haCriteriDiRicerca, preparaMazzo } from "@/lib/match";
import type { ProfiloRicerca } from "@/lib/match";
import type { TenantProfile, ListingConMatch, ListingProprietario } from "@/lib/types";

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

  const [
    { data: tenant },
    { data: zoneRows },
    { data: interessiRows },
    { data: recensioni },
    { data: giaCandidato },
  ] = await Promise.all([
    supabase.from("tenant_profiles").select("*").eq("profile_id", userId).single(),
    supabase.from("tenant_zone_interesse").select("zona").eq("tenant_id", userId),
    supabase
      .from("tenant_interessi")
      .select("attributo_key, peso")
      .eq("tenant_id", userId),
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

  // ---- Tutti gli annunci pubblicati che l'inquilino non ha già scelto ----
  // Budget, locali, metratura e zone NON filtrano più la query: li valuta
  // calcolaMatchInquilino, che decide se un annuncio è in ricerca, oltre la
  // ricerca (compare in fondo, marcato) o escluso (oltre la tolleranza sul
  // budget). Se non ci sono annunci, la query restituisce 0 risultati.
  let query = supabase
    .from("listings")
    .select(
      "id, titolo, zona, prezzo, locali, mq, descrizione, attributi, listing_photos(url, ordine)"
    )
    .eq("pubblicato", true);

  const listingIdsEsclusi = (giaCandidato ?? []).map((c) => c.listing_id as string);
  if (listingIdsEsclusi.length > 0) {
    query = query.not("id", "in", `(${listingIdsEsclusi.join(",")})`);
  }

  const { data: listings } = await query.order("created_at", { ascending: false });

  // Le foto arrivano senza garanzia di ordine: le riordino qui una volta
  // sola, così la card non deve pensarci a ogni render.
  const listingsOrdinati = (listings ?? []).map((l) => ({
    ...l,
    listing_photos: [...(l.listing_photos ?? [])].sort(
      (a, b) => (a.ordine ?? 0) - (b.ordine ?? 0)
    ),
  }));

  // Criteri di ricerca dell'inquilino. Un valore 0 o vuoto vale "nessuna
  // preferenza", come nel filtro che c'era prima.
  const profiloRicerca: ProfiloRicerca = {
    budgetMax: tenantProfile.budget_max || null,
    localiMin: tenantProfile.locali_min || null,
    mqMin: tenantProfile.mq_min || null,
    zone,
    interessi: Object.fromEntries(
      (interessiRows ?? []).map((r) => [r.attributo_key as string, r.peso as number])
    ),
  };

  const { mazzo, esclusi } = preparaMazzo(listingsOrdinati, profiloRicerca);

  return (
    <HomeClient
      affidabilita={affidabilita}
      listings={mazzo as unknown as ListingConMatch[]}
      esclusi={esclusi}
      mostraMatch={haCriteriDiRicerca(profiloRicerca)}
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
