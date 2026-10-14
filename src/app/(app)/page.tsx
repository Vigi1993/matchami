import { createClient } from "@/lib/supabase/server";
import { HomeClient } from "./HomeClient";
import { OwnerHomeClient } from "./OwnerHomeClient";
import { VerificaHome } from "./VerificaHome";
import type { ImmobileVerifica } from "@/lib/verifica";
import { computeAffidabilita } from "@/lib/affidabilita";
import { campiMatchDaRiga, haCriteriDiRicerca, preparaMazzo, profiloRicercaDaRighe } from "@/lib/match";
import { mappaLuoghi, type Luogo } from "@/lib/luoghi";
import type { ProfiloRicerca } from "@/lib/match";
import type { TenantProfile, ListingConMatch, ListingProprietario } from "@/lib/types";
import { idsNascosti } from "@/lib/scelte";

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
    { data: nascostiRighe },
  ] = await Promise.all([
    supabase.from("tenant_profiles").select("*").eq("profile_id", userId).single(),
    supabase.from("tenant_zone_interesse").select("zona, luogo_id").eq("tenant_id", userId),
    supabase
      .from("tenant_interessi")
      .select("attributo_key, peso, valore, necessaria")
      .eq("tenant_id", userId),
    supabase.from("recensioni").select("voto").eq("tenant_id", userId),
    supabase.from("candidature").select("listing_id").eq("tenant_id", userId),
    // i preferiti e gli scarti degli ultimi 30 giorni: non si rimettono nel mazzo.
    // Se la lettura non riesce, il mazzo si vede intero: meglio un annuncio in più che nessuno.
    supabase.rpc("annunci_nascosti"),
  ]);

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
      "id, titolo, zona, prezzo, locali, mq, descrizione, attributi, classe_energetica, ep_globale, luogo_id, tipologia, bagni, piano, riscaldamento, tipo_contratto, disponibile_dal, listing_photos(url, ordine)"
    )
    .eq("pubblicato", true);

  // Gli identificativi dei nascosti entrano in un filtro: passano solo se sono identificativi veri.
  const idsScelti = idsNascosti(nascostiRighe);
  const listingIdsEsclusi = [
    ...new Set([...(giaCandidato ?? []).map((c) => c.listing_id as string), ...idsScelti]),
  ];
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

  const profiloRicerca: ProfiloRicerca = profiloRicercaDaRighe(
    tenantProfile,
    zoneRows,
    interessiRows
  );

  // I luoghi (poche decine di righe): servono per sapere in quale quartiere, città e provincia sta ogni annuncio, e per il
  // completamento automatico della ricerca.
  const { data: luoghiRighe } = await supabase.from("luoghi").select("id, livello, nome, sigla, parent_id");
  const luoghi = (luoghiRighe ?? []) as Luogo[];
  const mappa = mappaLuoghi(luoghi);
  const annunci = listingsOrdinati.map((l) => ({ ...l, ...campiMatchDaRiga(l, mappa) }));

  const { mazzo, esclusiPerBudget, nascostiPerNecessarie } = preparaMazzo(annunci, profiloRicerca);

  // Se il mazzo è vuoto, bisogna dire PERCHÉ: nessun annuncio, o li ha già scelti tutti.
  let nascosti = 0;
  if (listingsOrdinati.length === 0 && idsScelti.length > 0) {
    const { count } = await supabase
      .from("listings")
      .select("id", { count: "exact", head: true })
      .in("id", idsScelti)
      .eq("pubblicato", true);
    nascosti = count ?? 0;
  }

  return (
    <HomeClient
      affidabilita={affidabilita}
      listings={mazzo as unknown as ListingConMatch[]}
      esclusi={esclusiPerBudget}
      nascostiPerNecessarie={nascostiPerNecessarie}
      luoghi={luoghi}
      mostraMatch={haCriteriDiRicerca(profiloRicerca)}
      nascosti={nascosti}
      ricerca={profiloRicerca}
    />
  );
}

async function OwnerHome({ userId }: { userId: string }) {
  const supabase = await createClient();

  // Un proprietario è verificato se ha almeno un immobile verificato. Finché
  // non lo è, la Home spiega cosa manca e permette di farlo. Se la domanda al
  // database non riesce si resta su questa schermata: meglio mostrare la
  // verifica a chi non serve che il resto dell'app a chi non l'ha ancora fatta.
  const { data: verificato } = await supabase.rpc("proprietario_verificato", {
    p_owner: userId,
  });
  if (verificato !== true) {
    const [{ data: miei }, { data: documenti }] = await Promise.all([
      supabase
        .from("listings")
        .select("id, titolo, zona, verifica_stato, verifica_esito_note, classe_energetica, luogo_id, bagni, piano, riscaldamento, tipo_contratto, disponibile_dal")
        .eq("owner_id", userId)
        .order("created_at", { ascending: false }),
      supabase.from("documenti_verifica").select("tipo, listing_id").eq("owner_id", userId),
    ]);

    const proprietaPerImmobile = new Map<string, number>();
    for (const d of documenti ?? []) {
      if (d.tipo === "proprieta" && d.listing_id) {
        proprietaPerImmobile.set(
          d.listing_id as string,
          (proprietaPerImmobile.get(d.listing_id as string) ?? 0) + 1
        );
      }
    }

    const immobili: ImmobileVerifica[] = (miei ?? []).map((l) => ({
      id: l.id as string,
      titolo: l.titolo as string,
      zona: l.zona as string,
      stato: l.verifica_stato as ImmobileVerifica["stato"],
      note: (l.verifica_esito_note as string | null) ?? null,
      nProprieta: proprietaPerImmobile.get(l.id as string) ?? 0,
      dati: {
        classe_energetica: (l.classe_energetica as string | null) ?? null,
        luogo_id: (l.luogo_id as string | null) ?? null,
        bagni: (l.bagni as number | null) ?? null,
        piano: (l.piano as number | null) ?? null,
        riscaldamento: (l.riscaldamento as string | null) ?? null,
        tipo_contratto: (l.tipo_contratto as string | null) ?? null,
        disponibile_dal: (l.disponibile_dal as string | null) ?? null,
      },
    }));

    return (
      <VerificaHome
        haIdentita={(documenti ?? []).some((d) => d.tipo === "identita")}
        immobili={immobili}
      />
    );
  }

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
