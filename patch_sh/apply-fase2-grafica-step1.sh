#!/usr/bin/env bash
set -e
echo "Applico Fase 2 grafica: componenti condivisi + navigazione responsive (sidebar desktop / barra smartphone)..."

rm -f src/components/TabBar.tsx

mkdir -p "src/app/(app)"
mkdir -p "src/app/(app)/candidature"
mkdir -p "src/app/(app)/database"
mkdir -p "src/app/(app)/gestione"
mkdir -p "src/app/(app)/gestione-affitti"
mkdir -p "src/app/(app)/immobili"
mkdir -p "src/app/(app)/profilo"
mkdir -p "src/components"
mkdir -p "src/components/ui"

cat > "src/components/ui/PageContainer.tsx" << 'MATCHAMI_FILE_EOF'
/**
 * Contenitore standard di ogni schermata. Su smartphone occupa la
 * larghezza disponibile con margini stretti (come oggi). Su desktop
 * (a partire da md), invece di restare largo quanto un telefono,
 * prende una larghezza confortevole per la lettura e più margine.
 *
 * Cambiare l'aspetto di TUTTE le schermate (padding, larghezza massima)
 * si fa modificando solo questo file.
 */
export function PageContainer({
  children,
  wide = false,
}: {
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className={`w-full mx-auto px-5 pt-6 pb-8 md:px-10 md:pt-10 md:pb-12 ${
        wide ? "max-w-5xl" : "max-w-3xl"
      }`}
    >
      {children}
    </div>
  );
}
MATCHAMI_FILE_EOF

cat > "src/components/ui/Card.tsx" << 'MATCHAMI_FILE_EOF'
export function Card({
  children,
  onClick,
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  const base = "bg-white border border-ink/10 rounded-2xl p-4";
  if (onClick) {
    return (
      <button onClick={onClick} className={`w-full text-left ${base} ${className}`}>
        {children}
      </button>
    );
  }
  return <div className={`${base} ${className}`}>{children}</div>;
}
MATCHAMI_FILE_EOF

cat > "src/components/ui/Button.tsx" << 'MATCHAMI_FILE_EOF'
type Variant = "primary" | "outline" | "ghost";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: "bg-gold text-ink",
  outline: "border-2 border-clay text-clay bg-transparent",
  ghost: "bg-ink/10 text-ink",
};

export function Button({
  children,
  onClick,
  type = "button",
  variant = "primary",
  disabled = false,
  className = "",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: Variant;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`font-bold text-sm py-3 rounded-xl disabled:opacity-50 transition-opacity ${VARIANT_CLASSES[variant]} ${className}`}
    >
      {children}
    </button>
  );
}
MATCHAMI_FILE_EOF

cat > "src/components/ui/Chip.tsx" << 'MATCHAMI_FILE_EOF'
export function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-xs font-semibold px-3 py-2 rounded-full border transition-colors text-left ${
        active
          ? "bg-moss/15 border-moss text-moss"
          : "bg-ink/5 border-transparent text-ink/60"
      }`}
    >
      {label}
    </button>
  );
}
MATCHAMI_FILE_EOF

cat > "src/components/ui/Field.tsx" << 'MATCHAMI_FILE_EOF'
export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-xs font-bold uppercase tracking-wide text-ink/70 mb-2">
        {label}
      </div>
      {children}
    </div>
  );
}
MATCHAMI_FILE_EOF

cat > "src/components/ui/Stepper.tsx" << 'MATCHAMI_FILE_EOF'
export function Stepper({
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix = "",
}: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
}) {
  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={() => onChange(Math.max(min, value - step))}
        className="w-8 h-8 rounded-full bg-ink/10 text-ink font-bold"
      >
        −
      </button>
      <div className="text-sm font-bold text-ink w-16 text-center">
        {value}
        {suffix}
      </div>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + step))}
        className="w-8 h-8 rounded-full bg-ink/10 text-ink font-bold"
      >
        +
      </button>
    </div>
  );
}
MATCHAMI_FILE_EOF

cat > "src/components/ui/Row.tsx" << 'MATCHAMI_FILE_EOF'
export function Row({
  color,
  title,
  subtitle,
  cta,
  onClick,
}: {
  color: string;
  title: string;
  subtitle: string;
  cta: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-start gap-3 text-left mb-4"
    >
      <div className="w-9 h-9 rounded-full shrink-0" style={{ background: color }} />
      <div className="flex-1">
        <div className="font-display font-bold text-sm text-ink">{title}</div>
        <p className="text-xs text-ink/55 leading-snug">{subtitle}</p>
        <span className="text-xs text-moss font-semibold">{cta}</span>
      </div>
    </button>
  );
}
MATCHAMI_FILE_EOF

cat > "src/components/ui/StatusBadge.tsx" << 'MATCHAMI_FILE_EOF'
const PRESETS = {
  attesa: "bg-gold/20 text-[#8A6A25]",
  positivo: "bg-moss/15 text-moss",
  neutro: "bg-ink/10 text-ink/40",
} as const;

export function StatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: keyof typeof PRESETS;
}) {
  return (
    <span
      className={`text-[10px] font-bold px-2 py-1 rounded-full ${PRESETS[tone]}`}
    >
      {label}
    </span>
  );
}
MATCHAMI_FILE_EOF

cat > "src/components/Navigation.tsx" << 'MATCHAMI_FILE_EOF'
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TENANT_TABS = [
  { href: "/", label: "Home" },
  { href: "/candidature", label: "Candidature" },
  { href: "/gestione", label: "Gestione affitto" },
  { href: "/profilo", label: "Profilo" },
];

const OWNER_TABS = [
  { href: "/", label: "Home" },
  { href: "/database", label: "Database" },
  { href: "/immobili", label: "Immobili" },
  { href: "/gestione-affitti", label: "Gestione affitti" },
  { href: "/profilo", label: "Profilo" },
];

export function Navigation({
  ruolo,
  nome,
}: {
  ruolo: string;
  nome?: string | null;
}) {
  const pathname = usePathname();
  const tabs = ruolo === "proprietario" ? OWNER_TABS : TENANT_TABS;

  return (
    <>
      {/* ---- Desktop: sidebar fissa a sinistra ---- */}
      <aside className="hidden md:flex md:flex-col md:fixed md:inset-y-0 md:left-0 md:w-64 bg-ink px-6 py-8">
        <div className="font-display italic text-xl text-paper mb-10">
          Match<span className="text-gold not-italic">AmI</span>
        </div>
        <nav className="flex flex-col gap-1">
          {tabs.map((t) => {
            const active = pathname === t.href;
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`px-4 py-3 rounded-xl text-sm font-semibold transition-colors ${
                  active
                    ? "bg-paper/10 text-gold"
                    : "text-paper/55 hover:text-paper hover:bg-paper/5"
                }`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
        {nome && (
          <div className="mt-auto text-xs text-paper/40">
            Connesso come <span className="text-paper/70">{nome}</span>
          </div>
        )}
      </aside>

      {/* ---- Smartphone: barra fissa in basso ---- */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-ink flex items-center justify-around py-3 px-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
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
    </>
  );
}
MATCHAMI_FILE_EOF

cat > "src/app/(app)/layout.tsx" << 'MATCHAMI_FILE_EOF'
import { createClient } from "@/lib/supabase/server";
import { Navigation } from "@/components/Navigation";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("ruolo, nome")
    .eq("id", user!.id)
    .single();

  const ruolo = profile?.ruolo ?? "inquilino";

  return (
    <div className="min-h-screen bg-paper">
      <Navigation ruolo={ruolo} nome={profile?.nome} />
      {/* pb-24: spazio per la barra in basso su smartphone.
          md:pl-64: spazio per la sidebar su desktop. md:pb-0: sul
          desktop la barra in basso non c'è, non serve il margine. */}
      <div className="pb-24 md:pb-0 md:pl-64">{children}</div>
    </div>
  );
}
MATCHAMI_FILE_EOF

cat > "src/app/(app)/HomeClient.tsx" << 'MATCHAMI_FILE_EOF'
"use client";

import { useState, useTransition } from "react";
import type { AffidabilitaResult } from "@/lib/affidabilita";
import type { ListingConFoto } from "@/lib/types";
import { candidati } from "./actions";
import { PageContainer } from "@/components/ui/PageContainer";

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
    <PageContainer>
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
    </PageContainer>
  );
}
MATCHAMI_FILE_EOF

cat > "src/app/(app)/OwnerHomeClient.tsx" << 'MATCHAMI_FILE_EOF'
import Link from "next/link";
import type { ListingProprietario } from "@/lib/types";
import { PageContainer } from "@/components/ui/PageContainer";

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
    <PageContainer>
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
    </PageContainer>
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

cat > "src/app/(app)/candidature/CandidatureClient.tsx" << 'MATCHAMI_FILE_EOF'
"use client";

import { useState } from "react";
import Link from "next/link";
import { Sheet } from "@/components/Sheet";
import type { CandidaturaConAnnuncio, StatoCandidatura } from "@/lib/types";
import { PageContainer } from "@/components/ui/PageContainer";

const STATO_LABEL: Record<StatoCandidatura, string> = {
  in_attesa: "Da valutare",
  accettata: "Match",
  rifiutata: "Scartata",
};

const STATO_COLOR: Record<StatoCandidatura, string> = {
  in_attesa: "bg-gold/20 text-[#8A6A25]",
  accettata: "bg-moss/15 text-moss",
  rifiutata: "bg-ink/10 text-ink/40",
};

export function CandidatureClient({
  candidature,
}: {
  candidature: CandidaturaConAnnuncio[];
}) {
  const [selezionata, setSelezionata] = useState<CandidaturaConAnnuncio | null>(
    null
  );

  const inAttesa = candidature.filter((c) => c.status === "in_attesa");
  const accettate = candidature.filter((c) => c.status === "accettata");
  const rifiutate = candidature.filter((c) => c.status === "rifiutata");

  return (
    <PageContainer>
      <h1 className="font-display text-xl text-ink mb-1">Le tue candidature</h1>
      <p className="text-xs text-ink/50 mb-6">
        {candidature.length === 0
          ? "Gli annunci a cui ti candidi arrivano qui."
          : `${candidature.length} candidatur${candidature.length === 1 ? "a inviata" : "e inviate"}${
              accettate.length > 0 ? ` · ${accettate.length} match` : ""
            }`}
      </p>

      {candidature.length === 0 ? (
        <div className="bg-ink/5 rounded-2xl p-4 text-xs text-ink/50">
          Ancora nessuna candidatura. Vai su Home e scorri gli annunci: le
          tue candidature e gli eventuali match finiscono qui.
        </div>
      ) : (
        <>
          {accettate.length > 0 && (
            <Gruppo
              titolo="Match"
              items={accettate}
              onSelect={setSelezionata}
            />
          )}
          {inAttesa.length > 0 && (
            <Gruppo
              titolo="Da valutare"
              items={inAttesa}
              onSelect={setSelezionata}
            />
          )}
          {rifiutate.length > 0 && (
            <Gruppo
              titolo="Scartate"
              items={rifiutate}
              onSelect={setSelezionata}
            />
          )}
        </>
      )}

      <Sheet
        open={selezionata !== null}
        onClose={() => setSelezionata(null)}
        title={selezionata?.listings?.titolo ?? "Candidatura"}
      >
        {selezionata && (
          <div className="flex flex-col gap-4">
            <span
              className={`self-start text-[10px] font-bold px-2 py-1 rounded-full ${STATO_COLOR[selezionata.status]}`}
            >
              {STATO_LABEL[selezionata.status]}
            </span>
            <DettaglioRow label="Zona" value={selezionata.listings?.zona ?? "—"} />
            <DettaglioRow
              label="Canone"
              value={
                selezionata.listings?.prezzo
                  ? `€${selezionata.listings.prezzo.toLocaleString("it-IT")}/mese`
                  : "—"
              }
            />
            <DettaglioRow
              label="Taglio"
              value={
                selezionata.listings?.locali
                  ? `${selezionata.listings.locali} locali · ${selezionata.listings.mq ?? "—"} m²`
                  : "—"
              }
            />
            {selezionata.match_pct !== null && (
              <DettaglioRow label="Compatibilità" value={`${selezionata.match_pct}%`} />
            )}

            {selezionata.status === "accettata" && (
              <div className="flex flex-col gap-2 mt-2">
                <div className="bg-moss/10 text-moss text-xs rounded-xl p-3">
                  Il proprietario ha accettato la tua candidatura.
                </div>
                <Link
                  href={`/chat/${selezionata.id}`}
                  className="w-full text-center bg-moss text-paper font-bold text-sm py-3 rounded-xl"
                >
                  Apri chat
                </Link>
              </div>
            )}
            {selezionata.status === "in_attesa" && (
              <div className="bg-ink/5 text-ink/60 text-xs rounded-xl p-3 mt-2">
                Il proprietario non ha ancora valutato questa candidatura.
              </div>
            )}
            {selezionata.status === "rifiutata" && (
              <div className="bg-ink/5 text-ink/50 text-xs rounded-xl p-3 mt-2">
                Il proprietario ha scelto un altro profilo per questo
                annuncio.
              </div>
            )}
          </div>
        )}
      </Sheet>
    </PageContainer>
  );
}

function Gruppo({
  titolo,
  items,
  onSelect,
}: {
  titolo: string;
  items: CandidaturaConAnnuncio[];
  onSelect: (c: CandidaturaConAnnuncio) => void;
}) {
  return (
    <div className="mb-6">
      <div className="mb-3 text-xs font-bold uppercase tracking-wide text-ink/50">
        {titolo} · {items.length}
      </div>
      <div className="flex flex-col gap-3">
        {items.map((c) => (
          <button
            key={c.id}
            onClick={() => onSelect(c)}
            className="w-full text-left bg-white border border-ink/10 rounded-2xl p-4"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-display font-bold text-sm text-ink">
                {c.listings?.titolo ?? "Immobile"}
              </span>
              <span
                className={`text-[10px] font-bold px-2 py-1 rounded-full ${STATO_COLOR[c.status]}`}
              >
                {STATO_LABEL[c.status]}
              </span>
            </div>
            <div className="text-xs text-ink/50">
              {c.listings?.zona ?? ""}
              {c.listings?.prezzo && ` · €${c.listings.prezzo.toLocaleString("it-IT")}/mese`}
              {c.match_pct !== null && ` · ${c.match_pct}% compatibile`}
            </div>
          </button>
        ))}
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

cat > "src/app/(app)/database/DatabaseClient.tsx" << 'MATCHAMI_FILE_EOF'
"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Sheet } from "@/components/Sheet";
import type { CandidaturaRicevuta } from "@/lib/types";
import { valutaCandidatura } from "./actions";
import { PageContainer } from "@/components/ui/PageContainer";

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
    <PageContainer>
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
              <div className="flex flex-col gap-2 mt-2">
                <div
                  className={`text-xs rounded-xl p-3 ${
                    stato(selezionata) === "accettata"
                      ? "bg-moss/10 text-moss"
                      : "bg-ink/5 text-ink/50"
                  }`}
                >
                  {stato(selezionata) === "accettata"
                    ? "Hai accettato questa candidatura."
                    : "Hai rifiutato questa candidatura."}
                </div>
                {stato(selezionata) === "accettata" && (
                  <Link
                    href={`/chat/${selezionata.id}`}
                    className="w-full text-center bg-moss text-paper font-bold text-sm py-3 rounded-xl"
                  >
                    Apri chat
                  </Link>
                )}
              </div>
            )}
          </div>
        )}
      </Sheet>
    </PageContainer>
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

cat > "src/app/(app)/gestione-affitti/GestioneAffittiClient.tsx" << 'MATCHAMI_FILE_EOF'
"use client";

import { useActionState, useEffect, useState } from "react";
import { Sheet } from "@/components/Sheet";
import type {
  CandidaturaSenzaContratto,
  ContrattoProprietario,
  StatoContratto,
} from "@/lib/types";
import { creaContratto, aggiornaContratto, type SaveState } from "./actions";
import { PageContainer } from "@/components/ui/PageContainer";
import { Chip } from "@/components/ui/Chip";
import { Field } from "@/components/ui/Field";

const STATO_LABEL: Record<StatoContratto, string> = {
  bozza: "Bozza",
  in_firma: "In firma",
  firmato: "Firmato",
  concluso: "Concluso",
};

const STATO_COLOR: Record<StatoContratto, string> = {
  bozza: "bg-ink/10 text-ink/60",
  in_firma: "bg-gold/20 text-[#8A6A25]",
  firmato: "bg-moss/15 text-moss",
  concluso: "bg-ink/10 text-ink/60",
};

const STATI: StatoContratto[] = ["bozza", "in_firma", "firmato", "concluso"];

export function GestioneAffittiClient({
  candidatureSenzaContratto,
  contratti,
}: {
  candidatureSenzaContratto: CandidaturaSenzaContratto[];
  contratti: ContrattoProprietario[];
}) {
  const [nuovaDa, setNuovaDa] = useState<CandidaturaSenzaContratto | null>(
    null
  );
  const [selezionato, setSelezionato] = useState<ContrattoProprietario | null>(
    null
  );

  return (
    <PageContainer>
      <h1 className="font-display text-xl text-ink mb-1">Gestione affitti</h1>
      <p className="text-xs text-ink/50 mb-6">
        Contratti dei tuoi immobili, dalla bozza alla firma.
      </p>

      {candidatureSenzaContratto.length > 0 && (
        <>
          <div className="mb-3 text-xs font-bold uppercase tracking-wide text-ink/50">
            Da avviare · {candidatureSenzaContratto.length}
          </div>
          <div className="flex flex-col gap-3 mb-6">
            {candidatureSenzaContratto.map((c) => (
              <button
                key={c.id}
                onClick={() => setNuovaDa(c)}
                className="w-full text-left bg-white border border-ink/10 rounded-2xl p-4"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-display font-bold text-sm text-ink">
                    {c.nome} {c.cognome}
                  </span>
                  <span className="text-[10px] font-bold px-2 py-1 rounded-full bg-gold/20 text-[#8A6A25]">
                    Crea contratto
                  </span>
                </div>
                <div className="text-xs text-ink/50">
                  {c.listings?.titolo} · {c.listings?.zona}
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      <div className="mb-3 text-xs font-bold uppercase tracking-wide text-ink/50">
        I tuoi contratti {contratti.length > 0 && `· ${contratti.length}`}
      </div>

      {contratti.length === 0 && candidatureSenzaContratto.length === 0 ? (
        <div className="bg-ink/5 rounded-2xl p-5 text-center">
          <h3 className="font-display font-bold text-sm text-ink mb-1">
            Nessun contratto ancora
          </h3>
          <p className="text-xs text-ink/50 max-w-xs mx-auto">
            Appena accetterai una candidatura, potrai avviare il contratto
            da qui.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {contratti.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelezionato(c)}
              className="w-full text-left bg-white border border-ink/10 rounded-2xl p-4"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-display font-bold text-sm text-ink">
                  {c.nome} {c.cognome}
                </span>
                <span
                  className={`text-[10px] font-bold px-2 py-1 rounded-full ${STATO_COLOR[c.stato]}`}
                >
                  {STATO_LABEL[c.stato]}
                </span>
              </div>
              <div className="text-xs text-ink/50">
                {c.candidature?.listings?.titolo}
                {c.canone && ` · €${c.canone.toLocaleString("it-IT")}/mese`}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* ---- Sheet: crea contratto da candidatura accettata ---- */}
      <Sheet
        open={nuovaDa !== null}
        onClose={() => setNuovaDa(null)}
        title={`Nuovo contratto — ${nuovaDa?.nome ?? ""} ${nuovaDa?.cognome ?? ""}`}
      >
        {nuovaDa && (
          <ContrattoForm
            action={creaContratto}
            candidaturaId={nuovaDa.id}
            onSaved={() => setNuovaDa(null)}
          />
        )}
      </Sheet>

      {/* ---- Sheet: modifica contratto esistente ---- */}
      <Sheet
        open={selezionato !== null}
        onClose={() => setSelezionato(null)}
        title={`${selezionato?.nome ?? ""} ${selezionato?.cognome ?? ""}`}
      >
        {selezionato && (
          <ContrattoForm
            action={aggiornaContratto}
            contratto={selezionato}
            onSaved={() => setSelezionato(null)}
          />
        )}
      </Sheet>
    </PageContainer>
  );
}

function ContrattoForm({
  action,
  candidaturaId,
  contratto,
  onSaved,
}: {
  action: (prevState: SaveState, formData: FormData) => Promise<SaveState>;
  candidaturaId?: string;
  contratto?: ContrattoProprietario;
  onSaved: () => void;
}) {
  const [state, formAction, pending] = useActionState(action, null);

  const [stato, setStato] = useState<StatoContratto>(
    contratto?.stato ?? "bozza"
  );
  const [canone, setCanone] = useState(contratto?.canone ?? 1200);
  const [durata, setDurata] = useState(contratto?.durata_mesi ?? 24);
  const [dataInizio, setDataInizio] = useState(
    contratto?.data_inizio?.slice(0, 10) ?? ""
  );
  const [dataFirma, setDataFirma] = useState(
    contratto?.data_firma?.slice(0, 10) ?? ""
  );

  useEffect(() => {
    if (state?.ok) {
      const t = setTimeout(onSaved, 600);
      return () => clearTimeout(t);
    }
  }, [state, onSaved]);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {candidaturaId && (
        <input type="hidden" name="candidatura_id" value={candidaturaId} />
      )}
      {contratto && <input type="hidden" name="id" value={contratto.id} />}
      <input type="hidden" name="stato" value={stato} />
      <input type="hidden" name="canone" value={canone} />
      <input type="hidden" name="durata_mesi" value={durata} />
      <input type="hidden" name="data_inizio" value={dataInizio} />
      {contratto && (
        <input type="hidden" name="data_firma" value={dataFirma} />
      )}

      <Field label="Stato">
        <div className="flex flex-wrap gap-2">
          {STATI.map((s) => (
            <Chip
              key={s}
              label={STATO_LABEL[s]}
              active={stato === s}
              onClick={() => setStato(s)}
            />
          ))}
        </div>
      </Field>

      <Field label={`Canone mensile · €${canone.toLocaleString("it-IT")}`}>
        <input
          type="range"
          min={400}
          max={3500}
          step={50}
          value={canone}
          onChange={(e) => setCanone(Number(e.target.value))}
          className="w-full"
        />
      </Field>

      <Field label="Durata (mesi)">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setDurata((d) => Math.max(6, d - 6))}
            className="w-8 h-8 rounded-full bg-ink/10 text-ink font-bold"
          >
            −
          </button>
          <div className="text-sm font-bold text-ink w-16 text-center">
            {durata}
          </div>
          <button
            type="button"
            onClick={() => setDurata((d) => Math.min(72, d + 6))}
            className="w-8 h-8 rounded-full bg-ink/10 text-ink font-bold"
          >
            +
          </button>
        </div>
      </Field>

      <Field label="Data inizio">
        <input
          type="date"
          value={dataInizio}
          onChange={(e) => setDataInizio(e.target.value)}
          className="w-full bg-ink/5 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gold"
        />
      </Field>

      {contratto && (
        <Field label="Data firma">
          <input
            type="date"
            value={dataFirma}
            onChange={(e) => setDataFirma(e.target.value)}
            className="w-full bg-ink/5 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gold"
          />
        </Field>
      )}

      {state?.error && <p className="text-clay text-xs">{state.error}</p>}
      {state?.ok && <p className="text-moss text-xs">Salvato.</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-full bg-gold text-ink font-bold text-sm py-3 rounded-xl disabled:opacity-60"
      >
        {pending ? "Salvataggio..." : "Salva"}
      </button>
    </form>
  );
}
MATCHAMI_FILE_EOF

cat > "src/app/(app)/gestione/GestioneClient.tsx" << 'MATCHAMI_FILE_EOF'
"use client";

import { useState } from "react";
import { Sheet } from "@/components/Sheet";
import type { ContrattoConAnnuncio, StatoContratto } from "@/lib/types";
import { PageContainer } from "@/components/ui/PageContainer";

const STATO_LABEL: Record<StatoContratto, string> = {
  bozza: "Bozza",
  in_firma: "In firma",
  firmato: "Firmato",
  concluso: "Concluso",
};

const STATO_COLOR: Record<StatoContratto, string> = {
  bozza: "bg-ink/10 text-ink/60",
  in_firma: "bg-gold/20 text-[#8A6A25]",
  firmato: "bg-moss/15 text-moss",
  concluso: "bg-ink/10 text-ink/60",
};

function formatData(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("it-IT", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function GestioneClient({
  contratti,
}: {
  contratti: ContrattoConAnnuncio[];
}) {
  const [selezionato, setSelezionato] = useState<ContrattoConAnnuncio | null>(
    null
  );
  const [bolletteAperto, setBolletteAperto] = useState(false);

  return (
    <PageContainer>
      <h1 className="font-display text-xl text-ink mb-1">Gestione affitto</h1>
      <p className="text-xs text-ink/50 mb-6">
        Contratto e bollette della casa che stai affittando, tutto in un
        posto.
      </p>

      {/* ---- I tuoi contratti ---- */}
      <div className="mb-3 text-xs font-bold uppercase tracking-wide text-ink/50">
        I tuoi contratti {contratti.length > 0 && `· ${contratti.length}`}
      </div>

      {contratti.length === 0 ? (
        <div className="bg-ink/5 rounded-2xl p-4 mb-6 text-xs text-ink/50">
          Nessun contratto ancora. Quando un proprietario accetterà una tua
          candidatura, il contratto comparirà qui.
        </div>
      ) : (
        <div className="flex flex-col gap-3 mb-6">
          {contratti.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelezionato(c)}
              className="w-full text-left bg-white border border-ink/10 rounded-2xl p-4"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-display font-bold text-sm text-ink">
                  {c.candidature?.listings?.titolo ?? "Immobile"}
                </span>
                <span
                  className={`text-[10px] font-bold px-2 py-1 rounded-full ${STATO_COLOR[c.stato]}`}
                >
                  {STATO_LABEL[c.stato]}
                </span>
              </div>
              <div className="text-xs text-ink/50">
                {c.candidature?.listings?.zona ?? ""}
                {c.canone && ` · €${c.canone.toLocaleString("it-IT")}/mese`}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* ---- Bollette e utenze ---- */}
      <div className="mb-3 text-xs font-bold uppercase tracking-wide text-ink/50">
        Bollette e utenze
      </div>
      <button
        onClick={() => setBolletteAperto(true)}
        className="w-full flex items-start gap-3 text-left bg-white border border-ink/10 rounded-2xl p-4"
      >
        <div className="w-9 h-9 rounded-full bg-moss shrink-0" />
        <div className="flex-1">
          <div className="font-display font-bold text-sm text-ink">
            Luce, gas e internet
          </div>
          <p className="text-xs text-ink/55 leading-snug">
            Stato attivazioni e prossime scadenze.
          </p>
          <span className="text-xs text-moss font-semibold">
            Vedi le bollette
          </span>
        </div>
      </button>

      {/* ---- Sheet: dettaglio contratto ---- */}
      <Sheet
        open={selezionato !== null}
        onClose={() => setSelezionato(null)}
        title={selezionato?.candidature?.listings?.titolo ?? "Contratto"}
      >
        {selezionato && (
          <div className="flex flex-col gap-4">
            <span
              className={`self-start text-[10px] font-bold px-2 py-1 rounded-full ${STATO_COLOR[selezionato.stato]}`}
            >
              {STATO_LABEL[selezionato.stato]}
            </span>
            <DettaglioRow
              label="Zona"
              value={selezionato.candidature?.listings?.zona ?? "—"}
            />
            <DettaglioRow
              label="Canone mensile"
              value={
                selezionato.canone
                  ? `€${selezionato.canone.toLocaleString("it-IT")}`
                  : "—"
              }
            />
            <DettaglioRow
              label="Durata"
              value={
                selezionato.durata_mesi
                  ? `${selezionato.durata_mesi} mesi`
                  : "—"
              }
            />
            <DettaglioRow
              label="Data inizio"
              value={formatData(selezionato.data_inizio)}
            />
            <DettaglioRow
              label="Data firma"
              value={formatData(selezionato.data_firma)}
            />
          </div>
        )}
      </Sheet>

      {/* ---- Sheet: bollette (demo) ---- */}
      <Sheet
        open={bolletteAperto}
        onClose={() => setBolletteAperto(false)}
        title="Bollette e utenze"
      >
        <p className="text-xs text-ink/60 mb-5">
          Luce, gas e internet della casa in affitto: qui vedrai stato
          attivazioni, importi e scadenze.
        </p>
        <div className="text-center py-6">
          <div className="w-12 h-12 rounded-full bg-gold/20 mx-auto mb-3" />
          <h3 className="font-display font-bold text-sm text-ink mb-1">
            Nessuna utenza attiva ancora
          </h3>
          <p className="text-xs text-ink/50 max-w-xs mx-auto mb-4">
            Attiva luce, gas e internet nella tua nuova casa e da qui potrai
            seguire importi e scadenze delle bollette.
          </p>
          <button className="bg-gold text-ink font-bold text-sm py-3 px-5 rounded-xl">
            Attiva luce, gas e internet
          </button>
        </div>
      </Sheet>
    </PageContainer>
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

cat > "src/app/(app)/immobili/ImmobiliClient.tsx" << 'MATCHAMI_FILE_EOF'
"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Sheet } from "@/components/Sheet";
import { ATTR_VOCAB, ZONE_MILANO } from "@/lib/constants";
import type { ImmobileDettaglio } from "@/lib/types";
import { PageContainer } from "@/components/ui/PageContainer";
import { Chip } from "@/components/ui/Chip";
import { Field } from "@/components/ui/Field";
import { Stepper } from "@/components/ui/Stepper";
import {
  creaImmobile,
  aggiornaImmobile,
  eliminaImmobile,
  type SaveState,
} from "./actions";

export function ImmobiliClient({
  immobili,
}: {
  immobili: ImmobileDettaglio[];
}) {
  const [nuovoAperto, setNuovoAperto] = useState(false);
  const [selezionato, setSelezionato] = useState<ImmobileDettaglio | null>(
    null
  );

  return (
    <PageContainer>
      <h1 className="font-display text-xl text-ink mb-1">I tuoi immobili</h1>
      <p className="text-xs text-ink/50 mb-6">
        {immobili.length === 0
          ? "Pubblica il tuo primo immobile per iniziare a ricevere candidature."
          : `${immobili.length} immobil${immobili.length === 1 ? "e" : "i"} pubblicat${immobili.length === 1 ? "o" : "i"}.`}
      </p>

      <button
        onClick={() => setNuovoAperto(true)}
        className="w-full bg-gold text-ink font-bold text-sm py-3 rounded-xl mb-6"
      >
        + Nuovo annuncio
      </button>

      {immobili.length === 0 ? (
        <div className="bg-ink/5 rounded-2xl p-5 text-center">
          <h3 className="font-display font-bold text-sm text-ink mb-1">
            Nessun immobile ancora
          </h3>
          <p className="text-xs text-ink/50 max-w-xs mx-auto">
            Tocca &quot;+ Nuovo annuncio&quot; qui sopra per pubblicare il
            primo.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {immobili.map((im) => (
            <button
              key={im.id}
              onClick={() => setSelezionato(im)}
              className="w-full text-left bg-white border border-ink/10 rounded-2xl p-4"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="font-display font-bold text-sm text-ink">
                  {im.titolo}
                </span>
                <span
                  className={`text-[10px] font-bold px-2 py-1 rounded-full ${
                    im.pubblicato
                      ? "bg-moss/15 text-moss"
                      : "bg-ink/10 text-ink/40"
                  }`}
                >
                  {im.pubblicato ? "Pubblicato" : "Non pubblicato"}
                </span>
              </div>
              <div className="text-xs text-ink/50">
                {im.zona} · €{im.prezzo.toLocaleString("it-IT")}/mese
                {im.nCandidature > 0 &&
                  ` · ${im.nCandidature} candidatur${im.nCandidature === 1 ? "a" : "e"}`}
              </div>
            </button>
          ))}
        </div>
      )}

      <Sheet
        open={nuovoAperto}
        onClose={() => setNuovoAperto(false)}
        title="Nuovo annuncio"
      >
        <ImmobileForm
          action={creaImmobile}
          onSaved={() => setNuovoAperto(false)}
        />
      </Sheet>

      <Sheet
        open={selezionato !== null}
        onClose={() => setSelezionato(null)}
        title={selezionato?.titolo ?? "Immobile"}
      >
        {selezionato && (
          <ImmobileForm
            action={aggiornaImmobile}
            immobile={selezionato}
            onSaved={() => setSelezionato(null)}
          />
        )}
      </Sheet>
    </PageContainer>
  );
}

function ImmobileForm({
  action,
  immobile,
  onSaved,
}: {
  action: (prevState: SaveState, formData: FormData) => Promise<SaveState>;
  immobile?: ImmobileDettaglio;
  onSaved: () => void;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const [pendingDelete, startDeleteTransition] = useTransition();
  const [erroreDelete, setErroreDelete] = useState<string | null>(null);

  const [zona, setZona] = useState(immobile?.zona ?? ZONE_MILANO[0]);
  const [prezzo, setPrezzo] = useState(immobile?.prezzo ?? 1200);
  const [locali, setLocali] = useState(immobile?.locali ?? 2);
  const [mq, setMq] = useState(immobile?.mq ?? 50);
  const [attributi, setAttributi] = useState<Record<string, boolean>>(
    immobile?.attributi ?? {}
  );
  const [pubblicato, setPubblicato] = useState(immobile?.pubblicato ?? true);

  function toggleAttributo(key: string) {
    setAttributi((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function elimina() {
    if (!immobile) return;
    if (!confirm(`Eliminare "${immobile.titolo}"? Non si può annullare.`))
      return;
    startDeleteTransition(async () => {
      const res = await eliminaImmobile(immobile.id);
      if (res?.error) {
        setErroreDelete(res.error);
      } else {
        onSaved();
      }
    });
  }

  // se il salvataggio è andato a buon fine, chiudi lo sheet dopo un attimo
  useEffect(() => {
    if (state?.ok) {
      const t = setTimeout(onSaved, 600);
      return () => clearTimeout(t);
    }
  }, [state, onSaved]);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      {immobile && <input type="hidden" name="id" value={immobile.id} />}
      <input type="hidden" name="zona" value={zona} />
      <input type="hidden" name="prezzo" value={prezzo} />
      <input type="hidden" name="locali" value={locali} />
      <input type="hidden" name="mq" value={mq} />
      <input type="hidden" name="attributi" value={JSON.stringify(attributi)} />
      <input type="hidden" name="pubblicato" value={String(pubblicato)} />

      <Field label="Titolo annuncio">
        <input
          name="titolo"
          defaultValue={immobile?.titolo}
          placeholder="Es. Bilocale luminoso ai Navigli"
          className="w-full bg-ink/5 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gold"
        />
      </Field>

      <Field label="Descrizione">
        <textarea
          name="descrizione"
          defaultValue={immobile?.descrizione ?? ""}
          rows={3}
          placeholder="Racconta l'immobile: luce, stato, dintorni..."
          className="w-full bg-ink/5 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gold"
        />
      </Field>

      <Field label="Zona">
        <div className="flex flex-wrap gap-2">
          {ZONE_MILANO.map((z) => (
            <Chip
              key={z}
              label={z.split(",")[0]}
              active={zona === z}
              onClick={() => setZona(z)}
            />
          ))}
        </div>
      </Field>

      <Field label={`Canone mensile · €${prezzo.toLocaleString("it-IT")}`}>
        <input
          type="range"
          min={400}
          max={3500}
          step={50}
          value={prezzo}
          onChange={(e) => setPrezzo(Number(e.target.value))}
          className="w-full"
        />
      </Field>

      <Field label="Locali">
        <Stepper value={locali} onChange={setLocali} min={1} max={8} />
      </Field>

      <Field label="Metratura">
        <Stepper value={mq} onChange={setMq} min={15} max={250} step={5} suffix=" m²" />
      </Field>

      <Field label="URL foto principale (opzionale)">
        <input
          name="fotoUrl"
          type="url"
          defaultValue={immobile?.fotoUrl ?? ""}
          placeholder="https://..."
          className="w-full bg-ink/5 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gold"
        />
        <p className="text-[11px] text-ink/40 mt-1">
          Il caricamento di file foto arriva in un prossimo passo — per ora
          incolla il link di un&apos;immagine già online.
        </p>
      </Field>

      <Field label="Caratteristiche">
        <div className="flex flex-wrap gap-2">
          {ATTR_VOCAB.map((a) => (
            <Chip
              key={a.key}
              label={a.label}
              active={!!attributi[a.key]}
              onClick={() => toggleAttributo(a.key)}
            />
          ))}
        </div>
      </Field>

      <Field label="Visibilità">
        <div className="flex gap-2">
          <Chip label="Pubblicato" active={pubblicato} onClick={() => setPubblicato(true)} />
          <Chip label="Non pubblicato" active={!pubblicato} onClick={() => setPubblicato(false)} />
        </div>
      </Field>

      {state?.error && <p className="text-clay text-xs">{state.error}</p>}
      {state?.ok && <p className="text-moss text-xs">Salvato.</p>}
      {erroreDelete && <p className="text-clay text-xs">{erroreDelete}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-full bg-gold text-ink font-bold text-sm py-3 rounded-xl disabled:opacity-60"
      >
        {pending ? "Salvataggio..." : "Salva"}
      </button>

      {immobile && (
        <button
          type="button"
          onClick={elimina}
          disabled={pendingDelete}
          className="w-full border-2 border-clay text-clay font-bold text-sm py-3 rounded-xl disabled:opacity-50"
        >
          {pendingDelete ? "Eliminazione..." : "Elimina annuncio"}
        </button>
      )}
    </form>
  );
}
MATCHAMI_FILE_EOF

cat > "src/app/(app)/profilo/OwnerProfiloClient.tsx" << 'MATCHAMI_FILE_EOF'
"use client";

import { useActionState, useEffect, useState } from "react";
import { Sheet } from "@/components/Sheet";
import type { OwnerProfile } from "@/lib/types";
import { updateDatiProprietario, type SaveState } from "./owner-actions";
import { logout } from "@/app/login/actions";
import { PageContainer } from "@/components/ui/PageContainer";
import { Chip } from "@/components/ui/Chip";
import { Field } from "@/components/ui/Field";

const TIPO_VOCAB = [
  { value: "privato", label: "Privato" },
  { value: "agenzia", label: "Agenzia" },
  { value: "property_manager", label: "Property manager" },
];

const OBIETTIVO_VOCAB = [
  "Affittare velocemente",
  "Massima selezione inquilini",
  "Un equilibrio tra i due",
];

export function OwnerProfiloClient({
  nome,
  owner,
}: {
  nome: string | null;
  owner: OwnerProfile;
}) {
  const [datiAperto, setDatiAperto] = useState(false);

  return (
    <PageContainer>
      {/* Avatar */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-full bg-ink text-paper flex items-center justify-center font-display font-bold">
          {(nome ?? "?").slice(0, 2).toUpperCase()}
        </div>
        <div>
          <div className="font-display font-bold text-ink">Il tuo profilo</div>
          <div className="text-xs text-ink/50">Proprietario</div>
        </div>
      </div>

      <Row
        color="var(--ink)"
        title="I tuoi dati"
        subtitle="Tipo di proprietario, immobili gestiti e priorità."
        cta="Vedi il dettaglio"
        onClick={() => setDatiAperto(true)}
      />
      <Row
        color="var(--moss)"
        title="Privacy e consensi"
        subtitle="Rivedi o modifica i consensi su marketing e condivisione dati con terzi."
        cta="Gestisci consensi"
        onClick={() => {}}
      />
      <Row
        color="var(--gold)"
        title="FAQ"
        subtitle="Domande frequenti su MatchAmI per i proprietari."
        cta="Vedi le domande frequenti"
        onClick={() => {}}
      />

      <form action={logout} className="mt-4">
        <button className="text-xs text-ink/40 underline">Esci</button>
      </form>

      <Sheet
        open={datiAperto}
        onClose={() => setDatiAperto(false)}
        title="I tuoi dati"
      >
        <DatiProprietarioForm owner={owner} onSaved={() => setDatiAperto(false)} />
      </Sheet>
    </PageContainer>
  );
}

function DatiProprietarioForm({
  owner,
  onSaved,
}: {
  owner: OwnerProfile;
  onSaved: () => void;
}) {
  const [state, formAction, pending] = useActionState<SaveState, FormData>(
    updateDatiProprietario,
    null
  );

  const [tipo, setTipo] = useState(owner.proprietario_tipo ?? "");
  const [numImmobili, setNumImmobili] = useState(owner.num_immobili ?? 1);
  const [obiettivo, setObiettivo] = useState(owner.obiettivo ?? "");

  useEffect(() => {
    if (state?.ok) {
      const t = setTimeout(onSaved, 600);
      return () => clearTimeout(t);
    }
  }, [state, onSaved]);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="proprietario_tipo" value={tipo} />
      <input type="hidden" name="num_immobili" value={numImmobili} />
      <input type="hidden" name="obiettivo" value={obiettivo} />

      <Field label="Tipo di proprietario">
        <div className="flex flex-wrap gap-2">
          {TIPO_VOCAB.map((t) => (
            <Chip
              key={t.value}
              label={t.label}
              active={tipo === t.value}
              onClick={() => setTipo(t.value)}
            />
          ))}
        </div>
      </Field>

      <Field label="Immobili gestiti su MatchAmI">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setNumImmobili((n) => Math.max(1, n - 1))}
            className="w-8 h-8 rounded-full bg-ink/10 text-ink font-bold"
          >
            −
          </button>
          <div className="text-sm font-bold text-ink w-10 text-center">
            {numImmobili}
          </div>
          <button
            type="button"
            onClick={() => setNumImmobili((n) => Math.min(50, n + 1))}
            className="w-8 h-8 rounded-full bg-ink/10 text-ink font-bold"
          >
            +
          </button>
        </div>
      </Field>

      <Field label="Priorità">
        <div className="flex flex-col gap-2">
          {OBIETTIVO_VOCAB.map((o) => (
            <Chip
              key={o}
              label={o}
              active={obiettivo === o}
              onClick={() => setObiettivo(o)}
            />
          ))}
        </div>
      </Field>

      {state?.error && <p className="text-clay text-xs">{state.error}</p>}
      {state?.ok && <p className="text-moss text-xs">Salvato.</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-full bg-gold text-ink font-bold text-sm py-3 rounded-xl disabled:opacity-60"
      >
        {pending ? "Salvataggio..." : "Salva"}
      </button>
    </form>
  );
}

function Row({
  color,
  title,
  subtitle,
  cta,
  onClick,
}: {
  color: string;
  title: string;
  subtitle: string;
  cta: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-start gap-3 text-left mb-4"
    >
      <div
        className="w-9 h-9 rounded-full shrink-0"
        style={{ background: color }}
      />
      <div className="flex-1">
        <div className="font-display font-bold text-sm text-ink">
          {title}
        </div>
        <p className="text-xs text-ink/55 leading-snug">{subtitle}</p>
        <span className="text-xs text-moss font-semibold">{cta}</span>
      </div>
    </button>
  );
}
MATCHAMI_FILE_EOF

cat > "src/app/(app)/profilo/ProfiloClient.tsx" << 'MATCHAMI_FILE_EOF'
"use client";

import { useActionState, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { LAVORO_VOCAB, ATTR_VOCAB, ZONE_MILANO } from "@/lib/constants";
import {
  computeAffidabilita,
  computeProfileCompleteness,
} from "@/lib/affidabilita";
import type { TenantProfile } from "@/lib/types";
import { updateDatiPersonali, updateRicerca, type SaveState } from "./actions";
import { logout } from "@/app/login/actions";
import { PageContainer } from "@/components/ui/PageContainer";
import { Chip } from "@/components/ui/Chip";
import { Field } from "@/components/ui/Field";
import { Stepper } from "@/components/ui/Stepper";

type Props = {
  nome: string | null;
  cognome: string | null;
  tenant: TenantProfile;
  zoneIniziali: string[];
  interessiIniziali: Record<string, number>;
  mediaRecensioni: number | null;
  numeroRecensioni: number;
};

export function ProfiloClient({
  nome,
  tenant,
  zoneIniziali,
  interessiIniziali,
  mediaRecensioni,
  numeroRecensioni,
}: Props) {
  const [sheetAperta, setSheetAperta] = useState<
    "affidabilita" | "dati" | "ricerca" | null
  >(null);

  const affidabilita = computeAffidabilita({
    verificato: tenant.verificato,
    protestato: tenant.protestato,
    garante: tenant.garante,
    fideiussione: tenant.fideiussione,
    professione: tenant.professione,
    reddito_mensile: tenant.reddito_mensile,
    mediaRecensioni,
    numeroRecensioni,
  });

  const completezza = computeProfileCompleteness({
    hasZone: zoneIniziali.length > 0,
    professione: tenant.professione,
    reddito_mensile: tenant.reddito_mensile,
    garante: tenant.garante,
    animali: tenant.animali,
    presentazione: tenant.presentazione,
    nucleo: tenant.nucleo,
    fideiussione: tenant.fideiussione,
  });

  return (
    <PageContainer>
      {/* Avatar */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-full bg-ink text-paper flex items-center justify-center font-display font-bold">
          {(nome ?? "?").slice(0, 2).toUpperCase()}
        </div>
        <div>
          <div className="font-display font-bold text-ink">Il tuo profilo</div>
          <div className="text-xs text-ink/50">In cerca a Milano</div>
        </div>
      </div>

      {/* Affidabilità */}
      <Row
        color="var(--gold)"
        title={`${affidabilita.punteggio}/100 · Affidabilità ${affidabilita.label}`}
        subtitle={
          affidabilita.hasRecensioni
            ? "Basato su recensioni dei precedenti affitti e verifiche sul tuo stato economico."
            : "Nessuna recensione ancora: il punteggio si basa per ora solo sulle verifiche economiche."
        }
        cta="Vedi il dettaglio"
        onClick={() => setSheetAperta("affidabilita")}
      />

      {/* Completezza */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex-1 h-2 rounded-full bg-ink/10 overflow-hidden">
          <div
            className="h-full bg-moss rounded-full transition-all"
            style={{ width: `${completezza}%` }}
          />
        </div>
        <span className="text-xs text-ink/50 whitespace-nowrap">
          {completezza}% completo
        </span>
      </div>

      {/* I tuoi dati */}
      <Row
        color="var(--ink)"
        title="I tuoi dati"
        subtitle="Lavoro, reddito, garante, protesti e presentazione: quello che vedono i proprietari."
        cta="Vedi il dettaglio"
        onClick={() => setSheetAperta("dati")}
      />

      {/* La tua ricerca */}
      <Row
        color="var(--clay)"
        title="La tua ricerca"
        subtitle="Budget, zone, taglio e caratteristiche della casa che stai cercando."
        cta="Vedi il dettaglio"
        onClick={() => setSheetAperta("ricerca")}
      />

      {/* Privacy / FAQ — segnaposto, arrivano in un prossimo passo */}
      <Row
        color="var(--moss)"
        title="Privacy e consensi"
        subtitle="Rivedi o modifica i consensi su marketing e condivisione dati con terzi."
        cta="Gestisci consensi"
        onClick={() => {}}
      />
      <Row
        color="var(--gold)"
        title="FAQ e bonus affitto"
        subtitle="Bonus giovani, contributo Comune di Milano, detrazioni 730 e altre curiosità."
        cta="Vedi le domande frequenti"
        onClick={() => {}}
      />

      <form action={logout} className="mt-4">
        <button className="text-xs text-ink/40 underline">Esci</button>
      </form>

      {/* ---- Sheet: Affidabilità (sola lettura) ---- */}
      <Sheet
        open={sheetAperta === "affidabilita"}
        onClose={() => setSheetAperta(null)}
        title="Il tuo voto di affidabilità"
      >
        <p className="text-xs text-ink/60 mb-4">
          Nasce dallo storico dei tuoi affitti su MatchAmI e dalle verifiche
          sul tuo stato economico. I proprietari lo vedono quando valutano
          una tua candidatura.
        </p>
        <div className="text-center mb-5">
          <div className="text-3xl font-display font-bold text-ink">
            {affidabilita.punteggio}/100
          </div>
          <div className="text-xs text-ink/50">{affidabilita.label}</div>
        </div>
        <div className="flex flex-col gap-2">
          {affidabilita.checks.map((c) => (
            <div
              key={c.label}
              className={`text-xs rounded-lg px-3 py-2 ${
                c.ok ? "bg-moss/10 text-moss" : "bg-clay/10 text-clay"
              }`}
            >
              {c.label}
            </div>
          ))}
        </div>
      </Sheet>

      {/* ---- Sheet: I tuoi dati ---- */}
      <DatiPersonaliSheet
        open={sheetAperta === "dati"}
        onClose={() => setSheetAperta(null)}
        tenant={tenant}
      />

      {/* ---- Sheet: La tua ricerca ---- */}
      <RicercaSheet
        open={sheetAperta === "ricerca"}
        onClose={() => setSheetAperta(null)}
        tenant={tenant}
        zoneIniziali={zoneIniziali}
        interessiIniziali={interessiIniziali}
      />
        </PageContainer>
  );
}

function Row({
  color,
  title,
  subtitle,
  cta,
  onClick,
}: {
  color: string;
  title: string;
  subtitle: string;
  cta: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-start gap-3 text-left mb-4"
    >
      <div
        className="w-9 h-9 rounded-full shrink-0"
        style={{ background: color }}
      />
      <div className="flex-1">
        <div className="font-display font-bold text-sm text-ink">
          {title}
        </div>
        <p className="text-xs text-ink/55 leading-snug">{subtitle}</p>
        <span className="text-xs text-moss font-semibold">{cta}</span>
      </div>
    </button>
  );
}

function SaveButton({ pending }: { pending: boolean }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full bg-gold text-ink font-bold text-sm py-3 rounded-xl mt-5 disabled:opacity-60"
    >
      {pending ? "Salvataggio..." : "Salva"}
    </button>
  );
}

function DatiPersonaliSheet({
  open,
  onClose,
  tenant,
}: {
  open: boolean;
  onClose: () => void;
  tenant: TenantProfile;
}) {
  const [state, formAction, pending] = useActionState<SaveState, FormData>(
    updateDatiPersonali,
    null
  );

  const [professione, setProfessione] = useState(tenant.professione ?? "");
  const [reddito, setReddito] = useState(tenant.reddito_mensile ?? 0);
  const [garante, setGarante] = useState<boolean | null>(tenant.garante);
  const [protestato, setProtestato] = useState<boolean | null>(
    tenant.protestato
  );
  const [fideiussione, setFideiussione] = useState<boolean | null>(
    tenant.fideiussione
  );
  const [nucleo, setNucleo] = useState(tenant.nucleo ?? "");
  const [figli, setFigli] = useState(tenant.figli);
  const [redditiNucleo, setRedditiNucleo] = useState(tenant.redditi_nucleo);
  const [animali, setAnimali] = useState<boolean | null>(tenant.animali);
  const [presentazione, setPresentazione] = useState(
    tenant.presentazione ?? ""
  );

  return (
    <Sheet open={open} onClose={onClose} title="I tuoi dati">
      <p className="text-xs text-ink/60 mb-4">
        Queste informazioni aiutano i proprietari a valutare la tua
        candidatura.
      </p>
      <form action={formAction} className="flex flex-col gap-5">
        <input type="hidden" name="professione" value={professione} />
        <input type="hidden" name="reddito_mensile" value={reddito} />
        <input type="hidden" name="garante" value={String(garante)} />
        <input type="hidden" name="protestato" value={String(protestato)} />
        <input
          type="hidden"
          name="fideiussione"
          value={String(fideiussione)}
        />
        <input type="hidden" name="nucleo" value={nucleo} />
        <input type="hidden" name="figli" value={figli} />
        <input type="hidden" name="redditi_nucleo" value={redditiNucleo} />
        <input type="hidden" name="animali" value={String(animali)} />

        <Field label="Situazione lavorativa">
          <div className="flex flex-wrap gap-2">
            {LAVORO_VOCAB.map((v) => (
              <Chip
                key={v}
                label={v}
                active={professione === v}
                onClick={() => setProfessione(v)}
              />
            ))}
          </div>
        </Field>

        <Field label={`Reddito netto mensile · €${reddito.toLocaleString("it-IT")}`}>
          <input
            type="range"
            min={0}
            max={8000}
            step={50}
            value={reddito}
            onChange={(e) => setReddito(Number(e.target.value))}
            className="w-full"
          />
        </Field>

        <Field label="Hai un garante disponibile?">
          <div className="flex gap-2">
            <Chip label="Sì" active={garante === true} onClick={() => setGarante(true)} />
            <Chip label="No" active={garante === false} onClick={() => setGarante(false)} />
          </div>
        </Field>

        <Field label="Hai protesti o segnalazioni in centrale rischi?">
          <div className="flex gap-2">
            <Chip label="No" active={protestato === false} onClick={() => setProtestato(false)} />
            <Chip label="Sì" active={protestato === true} onClick={() => setProtestato(true)} />
          </div>
        </Field>

        <Field label="Disponibile a firmare una fideiussione?">
          <div className="flex gap-2">
            <Chip label="Sì" active={fideiussione === true} onClick={() => setFideiussione(true)} />
            <Chip label="No" active={fideiussione === false} onClick={() => setFideiussione(false)} />
          </div>
        </Field>

        <Field label="Nucleo familiare">
          <div className="flex gap-2">
            <Chip label="Single" active={nucleo === "single"} onClick={() => setNucleo("single")} />
            <Chip label="Coppia" active={nucleo === "coppia"} onClick={() => setNucleo("coppia")} />
          </div>
        </Field>

        <Field label="Figli a carico">
          <Stepper value={figli} onChange={setFigli} min={0} max={8} />
        </Field>

        <Field label="Persone con reddito nel nucleo familiare">
          <Stepper value={redditiNucleo} onChange={setRedditiNucleo} min={1} max={6} />
        </Field>

        <Field label="Animali domestici?">
          <div className="flex gap-2">
            <Chip label="Sì" active={animali === true} onClick={() => setAnimali(true)} />
            <Chip label="No" active={animali === false} onClick={() => setAnimali(false)} />
          </div>
        </Field>

        <Field label="Presentati ai proprietari">
          <textarea
            name="presentazione"
            value={presentazione}
            onChange={(e) => setPresentazione(e.target.value)}
            placeholder="Es. Coppia di professionisti, non fumatori, cerchiamo casa per fine mese..."
            rows={4}
            className="w-full bg-ink/5 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-gold"
          />
        </Field>

        {state?.error && <p className="text-clay text-xs">{state.error}</p>}
        {state?.ok && (
          <p className="text-moss text-xs">Salvato — puoi chiudere.</p>
        )}
        <SaveButton pending={pending} />
      </form>
    </Sheet>
  );
}

function RicercaSheet({
  open,
  onClose,
  tenant,
  zoneIniziali,
  interessiIniziali,
}: {
  open: boolean;
  onClose: () => void;
  tenant: TenantProfile;
  zoneIniziali: string[];
  interessiIniziali: Record<string, number>;
}) {
  const [state, formAction, pending] = useActionState<SaveState, FormData>(
    updateRicerca,
    null
  );

  const [budget, setBudget] = useState(tenant.budget_max ?? 1300);
  const [locali, setLocali] = useState(tenant.locali_min ?? 2);
  const [mq, setMq] = useState(tenant.mq_min ?? 50);
  const [zone, setZone] = useState<string[]>(zoneIniziali);
  const [interessi, setInteressi] =
    useState<Record<string, number>>(interessiIniziali);

  function toggleZona(z: string) {
    setZone((prev) =>
      prev.includes(z) ? prev.filter((x) => x !== z) : [...prev, z]
    );
  }

  function toggleInteresse(key: string) {
    setInteressi((prev) => {
      const next = { ...prev };
      if (next[key]) delete next[key];
      else next[key] = 5;
      return next;
    });
  }

  return (
    <Sheet open={open} onClose={onClose} title="La tua ricerca">
      <p className="text-xs text-ink/60 mb-4">
        Le tue richieste possono cambiare nel tempo: aggiornale qui quando
        vuoi, il % di match si ricalcola subito.
      </p>
      <form action={formAction} className="flex flex-col gap-5">
        <input type="hidden" name="budget_max" value={budget} />
        <input type="hidden" name="locali_min" value={locali} />
        <input type="hidden" name="mq_min" value={mq} />
        <input type="hidden" name="zone" value={JSON.stringify(zone)} />
        <input
          type="hidden"
          name="interessi"
          value={JSON.stringify(interessi)}
        />

        <Field label={`Budget massimo · €${budget.toLocaleString("it-IT")}`}>
          <input
            type="range"
            min={900}
            max={2200}
            step={50}
            value={budget}
            onChange={(e) => setBudget(Number(e.target.value))}
            className="w-full"
          />
        </Field>

        <Field label="Zone preferite">
          <div className="flex flex-wrap gap-2">
            {ZONE_MILANO.map((z) => (
              <Chip
                key={z}
                label={z.split(",")[0]}
                active={zone.includes(z)}
                onClick={() => toggleZona(z)}
              />
            ))}
          </div>
        </Field>

        <Field label="Locali minimi">
          <Stepper value={locali} onChange={setLocali} min={1} max={6} />
        </Field>

        <Field label="Metratura minima">
          <Stepper value={mq} onChange={setMq} min={20} max={160} step={5} suffix=" m²" />
        </Field>

        <Field label="Caratteristiche che ti interessano">
          <div className="flex flex-wrap gap-2 mb-3">
            {ATTR_VOCAB.map((a) => (
              <Chip
                key={a.key}
                label={a.label}
                active={!!interessi[a.key]}
                onClick={() => toggleInteresse(a.key)}
              />
            ))}
          </div>
          <div className="flex flex-col gap-3">
            {Object.entries(interessi).map(([key, peso]) => {
              const attr = ATTR_VOCAB.find((a) => a.key === key);
              if (!attr) return null;
              return (
                <div key={key}>
                  <div className="text-xs text-ink/60 mb-1">
                    {attr.label} · {peso}/10
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={peso}
                    onChange={(e) =>
                      setInteressi((prev) => ({
                        ...prev,
                        [key]: Number(e.target.value),
                      }))
                    }
                    className="w-full"
                  />
                </div>
              );
            })}
          </div>
        </Field>

        {state?.error && <p className="text-clay text-xs">{state.error}</p>}
        {state?.ok && (
          <p className="text-moss text-xs">Salvato — puoi chiudere.</p>
        )}
        <SaveButton pending={pending} />
      </form>
    </Sheet>
  );
}
MATCHAMI_FILE_EOF

echo "Fatto. Ora lancio la build per verificare..."
rm -rf .next
npm run build
