#!/usr/bin/env bash
set -e
echo "Applico Database inquilini (Fase 4 - Step 5, lato proprietario)..."

mkdir -p "src/app/(app)"
mkdir -p "src/app/(app)/database"
mkdir -p "src/components"
mkdir -p "src/lib"
mkdir -p "supabase/migrations"

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

// Le altre schermate proprietario (Home, Immobili, Gestione affitti,
// Profilo) arrivano nei prossimi passi.
const OWNER_TABS = [{ href: "/database", label: "Database" }];

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
MATCHAMI_FILE_EOF

cat > "src/app/(app)/database/actions.ts" << 'MATCHAMI_FILE_EOF'
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function valutaCandidatura(
  candidaturaId: string,
  nuovoStato: "accettata" | "rifiutata"
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non autenticato." };

  const { error } = await supabase
    .from("candidature")
    .update({ status: nuovoStato, updated_at: new Date().toISOString() })
    .eq("id", candidaturaId);

  if (error) return { error: error.message };

  revalidatePath("/database");
  return { ok: true };
}
MATCHAMI_FILE_EOF

cat > "src/app/(app)/database/page.tsx" << 'MATCHAMI_FILE_EOF'
import { createClient } from "@/lib/supabase/server";
import { DatabaseClient } from "./DatabaseClient";
import type { CandidaturaRicevuta } from "@/lib/types";

export default async function DatabasePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Query 1: candidature ricevute sugli annunci di questo proprietario,
  // con i dati economici dell'inquilino (permesso dalla policy
  // "tenant_profiles: owner reads applicants").
  const { data: candidature } = await supabase
    .from("candidature")
    .select(
      "id, status, match_pct, created_at, tenant_id, listings!inner(owner_id, titolo, zona), tenant_profiles!inner(professione, reddito_mensile, verificato, presentazione)"
    )
    .eq("listings.owner_id", user!.id)
    .order("created_at", { ascending: false });

  // Query 2: nome/cognome degli inquilini (permesso dalla policy
  // "profiles: owner reads applicant profile", vedi migrazione 0003).
  const tenantIds = [...new Set((candidature ?? []).map((c) => c.tenant_id))];
  const { data: profili } =
    tenantIds.length > 0
      ? await supabase.from("profiles").select("id, nome, cognome").in("id", tenantIds)
      : { data: [] };

  const nomiPerTenant = new Map(
    (profili ?? []).map((p) => [p.id as string, { nome: p.nome, cognome: p.cognome }])
  );

  const candidatureComplete: CandidaturaRicevuta[] = (
    (candidature ?? []) as unknown as CandidaturaRicevuta[]
  ).map((c) => ({
    ...c,
    nome: nomiPerTenant.get(c.tenant_id)?.nome ?? null,
    cognome: nomiPerTenant.get(c.tenant_id)?.cognome ?? null,
  }));

  return <DatabaseClient candidature={candidatureComplete} />;
}
MATCHAMI_FILE_EOF

cat > "src/app/(app)/database/DatabaseClient.tsx" << 'MATCHAMI_FILE_EOF'
"use client";

import { useState, useTransition } from "react";
import { Sheet } from "@/components/Sheet";
import type { CandidaturaRicevuta } from "@/lib/types";
import { valutaCandidatura } from "./actions";

export function DatabaseClient({
  candidature,
}: {
  candidature: CandidaturaRicevuta[];
}) {
  const [selezionata, setSelezionata] = useState<CandidaturaRicevuta | null>(
    null
  );
  const [pending, startTransition] = useTransition();
  const [aggiornate, setAggiornate] = useState<
    Record<string, "accettata" | "rifiutata">
  >({});

  function stato(c: CandidaturaRicevuta): string {
    return aggiornate[c.id] ?? c.status;
  }

  function valuta(c: CandidaturaRicevuta, nuovo: "accettata" | "rifiutata") {
    startTransition(async () => {
      const res = await valutaCandidatura(c.id, nuovo);
      if (!res?.error) {
        setAggiornate((prev) => ({ ...prev, [c.id]: nuovo }));
        setSelezionata(null);
      }
    });
  }

  const inAttesa = candidature.filter((c) => stato(c) === "in_attesa");
  const valutate = candidature.filter((c) => stato(c) !== "in_attesa");

  return (
    <div className="px-5 pt-6 pb-8 max-w-md mx-auto">
      <h1 className="font-display text-xl text-ink mb-1">
        Database inquilini
      </h1>
      <p className="text-xs text-ink/50 mb-6">
        {candidature.length === 0
          ? "Le candidature ricevute sui tuoi annunci arrivano qui."
          : `${candidature.length} candidatur${candidature.length === 1 ? "a ricevuta" : "e ricevute"} · ${inAttesa.length} da valutare`}
      </p>

      {candidature.length === 0 && (
        <div className="bg-ink/5 rounded-2xl p-5 text-center">
          <h3 className="font-display font-bold text-sm text-ink mb-1">
            Nessuna candidatura ancora
          </h3>
          <p className="text-xs text-ink/50 max-w-xs mx-auto">
            Appena qualcuno si candiderà su un tuo annuncio pubblicato, lo
            vedrai qui.
          </p>
        </div>
      )}

      {inAttesa.length > 0 && (
        <Gruppo
          titolo="Da valutare"
          items={inAttesa}
          onSelect={setSelezionata}
          stato={stato}
        />
      )}
      {valutate.length > 0 && (
        <Gruppo
          titolo="Valutate"
          items={valutate}
          onSelect={setSelezionata}
          stato={stato}
        />
      )}

      <Sheet
        open={selezionata !== null}
        onClose={() => setSelezionata(null)}
        title={
          selezionata
            ? `${selezionata.nome ?? "Inquilino"} ${selezionata.cognome ?? ""}`
            : "Candidatura"
        }
      >
        {selezionata && (
          <div className="flex flex-col gap-4">
            <div className="text-xs text-ink/50">
              Candidatura per{" "}
              <b className="text-ink">{selezionata.listings?.titolo}</b>
            </div>

            <DettaglioRow
              label="Situazione lavorativa"
              value={selezionata.tenant_profiles?.professione ?? "—"}
            />
            <DettaglioRow
              label="Reddito dichiarato"
              value={
                selezionata.tenant_profiles?.reddito_mensile
                  ? `€${selezionata.tenant_profiles.reddito_mensile.toLocaleString("it-IT")}/mese`
                  : "—"
              }
            />
            <DettaglioRow
              label="Reddito verificato"
              value={selezionata.tenant_profiles?.verificato ? "Sì" : "No"}
            />
            {selezionata.match_pct !== null && (
              <DettaglioRow
                label="Compatibilità"
                value={`${selezionata.match_pct}%`}
              />
            )}
            {selezionata.tenant_profiles?.presentazione && (
              <div>
                <div className="text-xs text-ink/50 mb-1">Presentazione</div>
                <p className="text-sm text-ink italic">
                  &quot;{selezionata.tenant_profiles.presentazione}&quot;
                </p>
              </div>
            )}

            {stato(selezionata) === "in_attesa" ? (
              <div className="flex gap-3 mt-2">
                <button
                  onClick={() => valuta(selezionata, "rifiutata")}
                  disabled={pending}
                  className="flex-1 border-2 border-clay text-clay font-bold text-sm py-3 rounded-xl disabled:opacity-50"
                >
                  Rifiuta
                </button>
                <button
                  onClick={() => valuta(selezionata, "accettata")}
                  disabled={pending}
                  className="flex-1 bg-moss text-paper font-bold text-sm py-3 rounded-xl disabled:opacity-50"
                >
                  Accetta
                </button>
              </div>
            ) : (
              <div
                className={`text-xs rounded-xl p-3 mt-2 ${
                  stato(selezionata) === "accettata"
                    ? "bg-moss/10 text-moss"
                    : "bg-ink/5 text-ink/50"
                }`}
              >
                {stato(selezionata) === "accettata"
                  ? "Hai accettato questa candidatura."
                  : "Hai rifiutato questa candidatura."}
              </div>
            )}
          </div>
        )}
      </Sheet>
    </div>
  );
}

function Gruppo({
  titolo,
  items,
  onSelect,
  stato,
}: {
  titolo: string;
  items: CandidaturaRicevuta[];
  onSelect: (c: CandidaturaRicevuta) => void;
  stato: (c: CandidaturaRicevuta) => string;
}) {
  const COLOR: Record<string, string> = {
    in_attesa: "bg-gold/20 text-[#8A6A25]",
    accettata: "bg-moss/15 text-moss",
    rifiutata: "bg-ink/10 text-ink/40",
  };
  const LABEL: Record<string, string> = {
    in_attesa: "Da valutare",
    accettata: "Accettata",
    rifiutata: "Rifiutata",
  };

  return (
    <div className="mb-6">
      <div className="mb-3 text-xs font-bold uppercase tracking-wide text-ink/50">
        {titolo} · {items.length}
      </div>
      <div className="flex flex-col gap-3">
        {items.map((c) => {
          const s = stato(c);
          return (
            <button
              key={c.id}
              onClick={() => onSelect(c)}
              className="w-full text-left bg-white border border-ink/10 rounded-2xl p-4"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-display font-bold text-sm text-ink">
                  {c.nome} {c.cognome}
                </span>
                <span
                  className={`text-[10px] font-bold px-2 py-1 rounded-full ${COLOR[s]}`}
                >
                  {LABEL[s]}
                </span>
              </div>
              <div className="text-xs text-ink/50">
                {c.listings?.titolo} · {c.tenant_profiles?.professione ?? "—"}
                {c.match_pct !== null && ` · ${c.match_pct}% compatibile`}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DettaglioRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm border-b border-ink/10 pb-2">
      <span className="text-ink/50">{label}</span>
      <span className="font-semibold text-ink">{value}</span>
    </div>
  );
}
MATCHAMI_FILE_EOF

cat > "supabase/migrations/0003_owner_reads_applicant_profile.sql" << 'MATCHAMI_FILE_EOF'
-- ============================================================
-- MatchAmI — Fase 4 (lato proprietario): il proprietario deve poter
-- leggere nome/cognome degli inquilini che si sono candidati ai suoi
-- annunci. La policy "tenant_profiles: owner reads applicants" già lo
-- permetteva per i dati economici; qui aggiungiamo lo stesso per la
-- tabella "profiles" (dove stanno nome/cognome).
-- ============================================================

create policy "profiles: owner reads applicant profile" on profiles
  for select using (
    exists (
      select 1 from candidature c
      join listings l on l.id = c.listing_id
      where c.tenant_id = profiles.id
        and l.owner_id = auth.uid()
    )
  );
MATCHAMI_FILE_EOF

echo "Fatto. Ora lancio la build per verificare..."
rm -rf .next
npm run build
echo ""
echo "IMPORTANTE: ricordati di eseguire anche supabase/migrations/0003_owner_reads_applicant_profile.sql nell'SQL Editor di Supabase."
