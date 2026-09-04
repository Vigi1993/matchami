#!/usr/bin/env bash
set -e
echo "Applico la Home proprietario (Fase 4 - Step 6)..."

mkdir -p "src/app/(app)"
mkdir -p "src/components"
mkdir -p "src/lib"

cat > "src/lib/types.ts" << 'MATCHAMI_FILE_EOF'
export type Ruolo = "inquilino" | "proprietario";
export type NucleoFamiliare = "single" | "coppia";

export type TenantProfile = {
  profile_id: string;
  professione: string | null;
  reddito_mensile: number | null;
  garante: boolean | null;
  fideiussione: boolean | null;
  protestato: boolean | null;
  animali: boolean | null;
  nucleo: NucleoFamiliare | null;
  figli: number;
  redditi_nucleo: number;
  presentazione: string | null;
  verificato: boolean;
  verifica_stato: "non_avviata" | "in_verifica" | "verificato";
  budget_max: number | null;
  locali_min: number | null;
  mq_min: number | null;
};

export type StatoContratto = "bozza" | "in_firma" | "firmato" | "concluso";

export type StatoCandidatura = "in_attesa" | "accettata" | "rifiutata";

export type ListingProprietario = {
  id: string;
  titolo: string;
  zona: string;
  prezzo: number;
  pubblicato: boolean;
  nCandidature: number;
};

export type CandidaturaRicevuta = {
  id: string;
  status: StatoCandidatura;
  match_pct: number | null;
  created_at: string;
  tenant_id: string;
  listings: { titolo: string; zona: string } | null;
  tenant_profiles: {
    professione: string | null;
    reddito_mensile: number | null;
    verificato: boolean;
    presentazione: string | null;
  } | null;
  // aggiunto lato client dopo il fetch separato di profiles
  nome?: string | null;
  cognome?: string | null;
};

export type CandidaturaConAnnuncio = {
  id: string;
  status: StatoCandidatura;
  match_pct: number | null;
  created_at: string;
  listings: {
    titolo: string;
    zona: string;
    prezzo: number;
    locali: number | null;
    mq: number | null;
  } | null;
};

export type ListingConFoto = {
  id: string;
  titolo: string;
  zona: string;
  prezzo: number;
  locali: number | null;
  mq: number | null;
  descrizione: string | null;
  listing_photos: { url: string }[];
};

export type ContrattoConAnnuncio = {
  id: string;
  stato: StatoContratto;
  canone: number | null;
  durata_mesi: number | null;
  data_inizio: string | null;
  data_firma: string | null;
  candidature: {
    listings: { titolo: string; zona: string } | null;
  } | null;
};
MATCHAMI_FILE_EOF

cat > "src/components/TabBar.tsx" << 'MATCHAMI_FILE_EOF'
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TENANT_TABS = [
  { href: "/", label: "Home" },
  { href: "/candidature", label: "Candidature" },
  { href: "/gestione", label: "Gestione affitto" },
  { href: "/profilo", label: "Profilo" },
];

// Le altre schermate proprietario (Immobili, Gestione affitti, Profilo)
// arrivano nei prossimi passi.
const OWNER_TABS = [
  { href: "/", label: "Home" },
  { href: "/database", label: "Database" },
];

export function TabBar({ ruolo }: { ruolo: string }) {
  const pathname = usePathname();
  const tabs = ruolo === "proprietario" ? OWNER_TABS : TENANT_TABS;

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-ink flex items-center justify-around py-3 px-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
      {tabs.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`flex flex-col items-center text-center text-[10px] font-semibold px-2 leading-tight ${
              active ? "text-gold" : "text-paper/50"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
MATCHAMI_FILE_EOF

cat > "src/app/(app)/page.tsx" << 'MATCHAMI_FILE_EOF'
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
MATCHAMI_FILE_EOF

cat > "src/app/(app)/OwnerHomeClient.tsx" << 'MATCHAMI_FILE_EOF'
import Link from "next/link";
import type { ListingProprietario } from "@/lib/types";

export function OwnerHomeClient({
  listings,
  totaleCandidature,
  daValutare,
}: {
  listings: ListingProprietario[];
  totaleCandidature: number;
  daValutare: number;
}) {
  return (
    <div className="px-5 pt-6 pb-8 max-w-md mx-auto">
      <h1 className="font-display text-xl text-ink mb-1">Home</h1>
      <p className="text-xs text-ink/50 mb-6">
        Il riepilogo dei tuoi annunci e delle candidature ricevute.
      </p>

      {/* ---- Statistiche ---- */}
      <div className="bg-ink text-paper rounded-2xl p-4 mb-6 flex items-center justify-between">
        <Stat value={totaleCandidature} label="candidature ricevute" />
        <Stat value={daValutare} label="da valutare ora" highlight />
        <Stat value={listings.length} label="immobili pubblicati" />
      </div>

      {daValutare > 0 && (
        <Link
          href="/database"
          className="block bg-gold text-ink font-bold text-sm text-center py-3 rounded-xl mb-6"
        >
          Vai al Database — {daValutare} da valutare
        </Link>
      )}

      {/* ---- I tuoi immobili ---- */}
      <div className="mb-3 text-xs font-bold uppercase tracking-wide text-ink/50">
        I tuoi immobili {listings.length > 0 && `· ${listings.length}`}
      </div>

      {listings.length === 0 ? (
        <div className="bg-ink/5 rounded-2xl p-5 text-center">
          <h3 className="font-display font-bold text-sm text-ink mb-1">
            Non hai ancora pubblicato nessun immobile
          </h3>
          <p className="text-xs text-ink/50 max-w-xs mx-auto">
            La pubblicazione di un nuovo annuncio arriva in un prossimo
            passo (schermata Immobili).
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {listings.map((l) => (
            <div
              key={l.id}
              className="bg-white border border-ink/10 rounded-2xl p-4"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-display font-bold text-sm text-ink">
                  {l.titolo}
                </span>
                {!l.pubblicato && (
                  <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-ink/10 text-ink/50">
                    Non pubblicato
                  </span>
                )}
              </div>
              <div className="text-xs text-ink/50">
                {l.zona} · €{l.prezzo.toLocaleString("it-IT")}/mese
                {l.nCandidature > 0 && ` · ${l.nCandidature} candidatur${l.nCandidature === 1 ? "a" : "e"}`}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({
  value,
  label,
  highlight = false,
}: {
  value: number;
  label: string;
  highlight?: boolean;
}) {
  return (
    <div>
      <div
        className={`text-2xl font-display font-bold ${highlight ? "text-gold" : "text-paper"}`}
      >
        {value}
      </div>
      <div className="text-[10px] text-paper/60 leading-tight max-w-[70px]">
        {label}
      </div>
    </div>
  );
}
MATCHAMI_FILE_EOF

echo "Fatto. Ora lancio la build per verificare..."
rm -rf .next
npm run build
