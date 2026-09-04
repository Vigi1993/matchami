import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { HomeClient } from "./HomeClient";
import { computeAffidabilita } from "@/lib/affidabilita";
import type { TenantProfile, ListingConFoto } from "@/lib/types";

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

  // La Home vera per il proprietario arriva in un prossimo passo: per ora
  // lo mandiamo dritto al Database, che è già il suo schermo principale.
  if (profile?.ruolo === "proprietario") {
    redirect("/database");
  }

  const [{ data: tenant }, { data: zoneRows }, { data: recensioni }, { data: giaCandidato }] =
    await Promise.all([
      supabase.from("tenant_profiles").select("*").eq("profile_id", user!.id).single(),
      supabase.from("tenant_zone_interesse").select("zona").eq("tenant_id", user!.id),
      supabase.from("recensioni").select("voto").eq("tenant_id", user!.id),
      supabase.from("candidature").select("listing_id").eq("tenant_id", user!.id),
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
