#!/usr/bin/env bash
set -e
echo "Applico la Home (Fase 4 - Step 4)..."

mkdir -p "src/app/(app)"
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

cat > "src/app/(app)/actions.ts" << 'MATCHAMI_FILE_EOF'
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function candidati(listingId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non autenticato." };

  const { error } = await supabase.from("candidature").insert({
    listing_id: listingId,
    tenant_id: user.id,
    status: "in_attesa",
  });

  if (error) return { error: error.message };

  revalidatePath("/");
  revalidatePath("/candidature");
  return { ok: true };
}
MATCHAMI_FILE_EOF

cat > "src/app/(app)/page.tsx" << 'MATCHAMI_FILE_EOF'
import { createClient } from "@/lib/supabase/server";
import { HomeClient } from "./HomeClient";
import { computeAffidabilita } from "@/lib/affidabilita";
import type { TenantProfile, ListingConFoto } from "@/lib/types";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
MATCHAMI_FILE_EOF

cat > "src/app/(app)/HomeClient.tsx" << 'MATCHAMI_FILE_EOF'
"use client";

import { useState, useTransition } from "react";
import type { AffidabilitaResult } from "@/lib/affidabilita";
import type { ListingConFoto } from "@/lib/types";
import { candidati } from "./actions";

export function HomeClient({
  affidabilita,
  listings,
}: {
  affidabilita: AffidabilitaResult;
  listings: ListingConFoto[];
}) {
  const [index, setIndex] = useState(0);
  const [candidatureInviate, setCandidatureInviate] = useState<Set<string>>(
    new Set()
  );
  const [pending, startTransition] = useTransition();

  const attuale = listings[index];
  const finito = index >= listings.length;

  function scarta() {
    setIndex((i) => i + 1);
  }

  function candidati_(listing: ListingConFoto) {
    startTransition(async () => {
      const res = await candidati(listing.id);
      if (!res?.error) {
        setCandidatureInviate((prev) => new Set(prev).add(listing.id));
      }
      setIndex((i) => i + 1);
    });
  }

  return (
    <div className="px-5 pt-6 pb-8 max-w-md mx-auto">
      {/* ---- Barra affidabilità + conteggio ---- */}
      <div className="bg-ink text-paper rounded-2xl p-4 mb-6 flex items-center justify-between">
        <div>
          <div className="text-2xl font-display font-bold text-gold">
            {affidabilita.punteggio}
          </div>
          <div className="text-[10px] text-paper/60 leading-tight">
            Affidabilità
            <br />
            <b className="text-paper">{affidabilita.label}</b>
          </div>
        </div>
        <div className="text-right text-[10px] text-paper/80 leading-tight">
          <b className="text-paper text-base">{listings.length}</b> casa
          {listings.length === 1 ? "" : "e"} in linea
          <br />
          con la tua ricerca
        </div>
      </div>

      {/* ---- Nessun annuncio ---- */}
      {listings.length === 0 && (
        <div className="bg-ink/5 rounded-2xl p-5 text-center">
          <div className="w-11 h-11 rounded-full bg-gold/20 mx-auto mb-3" />
          <h3 className="font-display font-bold text-sm text-ink mb-1">
            Nessun annuncio in linea con la tua ricerca
          </h3>
          <p className="text-xs text-ink/50 max-w-xs mx-auto">
            Appena ci saranno immobili pubblicati che rientrano nei tuoi
            criteri, li vedrai qui. Nel frattempo puoi aggiornare i criteri
            in Profilo → La tua ricerca.
          </p>
        </div>
      )}

      {/* ---- Deck esaurito ---- */}
      {listings.length > 0 && finito && (
        <div className="bg-ink/5 rounded-2xl p-5 text-center">
          <h3 className="font-display font-bold text-sm text-ink mb-1">
            Hai visto tutti gli annunci disponibili
          </h3>
          <p className="text-xs text-ink/50">
            Torna più tardi: ne arrivano di nuovi appena vengono pubblicati.
          </p>
        </div>
      )}

      {/* ---- Card corrente ---- */}
      {attuale && !finito && (
        <div className="flex flex-col gap-4">
          <div className="relative rounded-3xl overflow-hidden bg-ink h-[420px]">
            {attuale.listing_photos?.[0]?.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={attuale.listing_photos[0].url}
                alt={attuale.titolo}
                className="absolute inset-0 w-full h-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="font-display italic text-5xl text-paper/15">
                  {attuale.titolo.slice(0, 2).toUpperCase()}
                </span>
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/90 to-transparent p-4">
              <div className="font-display font-bold text-paper">
                {attuale.titolo}
              </div>
              <div className="text-xs text-paper/70">
                {attuale.zona} · €{attuale.prezzo.toLocaleString("it-IT")}/mese
                {attuale.locali && ` · ${attuale.locali} locali`}
                {attuale.mq && ` · ${attuale.mq} m²`}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-center gap-6">
            <button
              onClick={scarta}
              disabled={pending}
              aria-label="Scarta"
              className="w-14 h-14 rounded-full border-2 border-clay text-clay flex items-center justify-center text-2xl disabled:opacity-50"
            >
              ✕
            </button>
            <button
              onClick={() => candidati_(attuale)}
              disabled={pending}
              aria-label="Candidati"
              className="w-16 h-16 rounded-full bg-moss text-paper flex items-center justify-center text-2xl disabled:opacity-50"
            >
              ♥
            </button>
          </div>
          <p className="text-center text-[11px] text-ink/40">
            {index + 1} di {listings.length}
          </p>
        </div>
      )}

      {candidatureInviate.size > 0 && (
        <p className="text-center text-xs text-moss mt-4">
          Candidatura inviata — la trovi in &quot;Candidature&quot;.
        </p>
      )}
    </div>
  );
}
MATCHAMI_FILE_EOF

echo "Fatto. Ora lancio la build per verificare..."
rm -rf .next
npm run build
