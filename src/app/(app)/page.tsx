import { createClient } from "@/lib/supabase/server";
import { HomeClient } from "./HomeClient";
import { OwnerHomeClient } from "./OwnerHomeClient";
import { VerificaHome } from "./VerificaHome";
import { documentiProprieta, type ImmobileVerifica } from "@/lib/verifica";
import { computeAffidabilita } from "@/lib/affidabilita";
import { riepilogoRecensioni, statoRaccomandazione } from "@/lib/recensioni";
import { campiMatchDaRiga, haCriteriDiRicerca, preparaMazzo, profiloRicercaDaRighe } from "@/lib/match";
import { mappaLuoghi, type Luogo } from "@/lib/luoghi";
import { possibiliPerAnnuncio } from "@/lib/proprietario/possibili-server";
import { annuncioDaRiga } from "@/lib/match";
import { oraInItalia, type CasaHome } from "@/lib/proprietario/home";
import type { ProfiloRicerca } from "@/lib/match";
import type { TenantProfile, ListingConMatch } from "@/lib/types";
import { idsNascosti } from "@/lib/scelte";
import { VerificaRedditoPanel } from "@/components/VerificaRedditoPanel";
import { VerificaProtestiPanel } from "@/components/VerificaProtestiPanel";
import type { DocumentoInquilino } from "@/lib/verifica-inquilino";

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
    { data: documentiRows },
  ] = await Promise.all([
    supabase.from("tenant_profiles").select("*").eq("profile_id", userId).single(),
    supabase.from("tenant_zone_interesse").select("zona, luogo_id").eq("tenant_id", userId),
    supabase
      .from("tenant_interessi")
      .select("attributo_key, peso, valore, necessaria")
      .eq("tenant_id", userId),
    supabase.from("recensioni").select("voto, autore_id, created_at").eq("tenant_id", userId),
    supabase.from("candidature").select("listing_id").eq("tenant_id", userId),
    // i preferiti e gli scarti degli ultimi 30 giorni: non si rimettono nel mazzo.
    // Se la lettura non riesce, il mazzo si vede intero: meglio un annuncio in più che nessuno.
    supabase.rpc("annunci_nascosti"),
    // i documenti della verifica del reddito (per il pannello dentro «I tuoi dati»)
    supabase.from("documenti_inquilino").select("id, tipo, percorso, nome_file").eq("tenant_id", userId).order("created_at", { ascending: true }),
  ]);

  // Le recensioni dei proprietari stanno a parte dal punteggio di affidabilità: si mostrano accanto.
  const riepilogo = riepilogoRecensioni((recensioni ?? []).map((r) => r.voto));
  // il badge «Inquilino raccomandato»: due recensioni positive da due proprietari diversi
  const raccomandazione = statoRaccomandazione(recensioni ?? []);

  const tenantProfile = tenant as TenantProfile;

  const affidabilita = computeAffidabilita({
    verificato: tenantProfile.verificato,
    protestato: tenantProfile.protestato,
    garante: tenantProfile.garante,
    fideiussione: tenantProfile.fideiussione,
    protestiVerificati: tenantProfile.protesti_verifica_stato === "verificato",
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
      recensioni={riepilogo}
      raccomandazione={raccomandazione}
      tenant={tenantProfile}
      verificaPanel={
        <VerificaRedditoPanel
          stato={tenantProfile.verifica_stato}
          nota={tenantProfile.verifica_esito_note}
          dati={{ professione: tenantProfile.professione, reddito_mensile: tenantProfile.reddito_mensile }}
          documenti={(documentiRows ?? []) as DocumentoInquilino[]}
        />
      }
      protestiPanel={
        <VerificaProtestiPanel
          stato={tenantProfile.protesti_verifica_stato ?? "non_avviata"}
          nota={tenantProfile.protesti_verifica_esito_note ?? null}
          protestato={tenantProfile.protestato}
          documenti={(documentiRows ?? []) as DocumentoInquilino[]}
        />
      }
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
      supabase.from("documenti_verifica").select("id, tipo, listing_id, nome_file, percorso, created_at").eq("owner_id", userId),
    ]);

    const immobili: ImmobileVerifica[] = (miei ?? []).map((l) => ({
      id: l.id as string,
      titolo: l.titolo as string,
      zona: l.zona as string,
      stato: l.verifica_stato as ImmobileVerifica["stato"],
      note: (l.verifica_esito_note as string | null) ?? null,
      documenti: documentiProprieta(documenti, l.id as string),
      nProprieta: documentiProprieta(documenti, l.id as string).length,
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

  const [{ data: listings }, { data: candidature }, { data: profilo }, { data: luoghiRighe }] = await Promise.all([
    supabase
      .from("listings")
      .select(
        "id, titolo, zona, prezzo, locali, mq, attributi, classe_energetica, luogo_id, tipologia, bagni, piano, riscaldamento, tipo_contratto, disponibile_dal, pubblicato, verifica_stato, listing_photos(url, ordine)"
      )
      .eq("owner_id", userId)
      .order("created_at", { ascending: false }),
    supabase
      .from("candidature")
      .select("id, status, listing_id, tenant_id, listings!inner(owner_id)")
      .eq("listings.owner_id", userId),
    supabase.from("profiles").select("nome").eq("id", userId).single(),
    supabase.from("luoghi").select("id, livello, nome, sigla, parent_id"),
  ]);

  // Per ogni casa: quante candidature, quante da valutare, e chi si è già candidato (serve solo a non contarlo tra i «possibili»)
  const nCandidature = new Map<string, number>();
  const daValutarePer = new Map<string, number>();
  const giaCandidati = new Map<string, Set<string>>();
  for (const c of candidature ?? []) {
    const id = c.listing_id as string;
    nCandidature.set(id, (nCandidature.get(id) ?? 0) + 1);
    if (c.status === "in_attesa") daValutarePer.set(id, (daValutarePer.get(id) ?? 0) + 1);
    const insieme = giaCandidati.get(id) ?? new Set<string>();
    insieme.add(c.tenant_id as string);
    giaCandidati.set(id, insieme);
  }

  // I possibili inquilini: solo per le case che gli inquilini vedono (verificate e pubblicate). È un numero, mai un elenco.
  const mappa = mappaLuoghi((luoghiRighe ?? []) as Luogo[]);
  const visibili = (listings ?? []).filter((l) => l.pubblicato === true && l.verifica_stato === "verificato");
  const conteggi = await possibiliPerAnnuncio(
    visibili.map((l) => annuncioDaRiga({ ...(l as Parameters<typeof annuncioDaRiga>[0]), id: l.id as string }, mappa)),
    giaCandidati
  );

  const case_: CasaHome[] = (listings ?? []).map((l) => {
    const foto = [...(l.listing_photos ?? [])].sort((a, b) => (a.ordine ?? 0) - (b.ordine ?? 0))[0]?.url ?? null;
    return {
      id: l.id as string,
      titolo: l.titolo as string,
      zona: l.zona as string,
      prezzo: l.prezzo as number,
      locali: (l.locali as number | null) ?? null,
      mq: (l.mq as number | null) ?? null,
      pubblicato: l.pubblicato === true,
      verificata: l.verifica_stato === "verificato",
      foto,
      nCandidature: nCandidature.get(l.id as string) ?? 0,
      daValutare: daValutarePer.get(l.id as string) ?? 0,
      possibili: conteggi?.get(l.id as string) ?? null,
    };
  });

  return <OwnerHomeClient case_={case_} nome={(profilo?.nome as string | null) ?? null} ora={oraInItalia()} />;
}
