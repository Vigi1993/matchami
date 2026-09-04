#!/usr/bin/env bash
set -e
echo "Applico i file della Fase 4 - Step 1 (Profilo inquilino)..."

# Rimuove la vecchia homepage in root (si sposta dentro il gruppo (app))
rm -f src/app/page.tsx

mkdir -p "src/app/(app)"
mkdir -p "src/app/(app)/candidature"
mkdir -p "src/app/(app)/gestione"
mkdir -p "src/app/(app)/profilo"
mkdir -p "src/components"
mkdir -p "src/lib"

cat > "src/lib/constants.ts" << 'MATCHAMI_FILE_EOF'
export const LAVORO_VOCAB = [
  "Dipendente indeterminato",
  "Dipendente determinato",
  "Libero professionista",
  "Studente",
  "Pensionato",
] as const;

export const ATTR_VOCAB = [
  { key: "balcone", label: "Balcone" },
  { key: "terrazzo", label: "Terrazzo" },
  { key: "giardino", label: "Giardino condominiale" },
  { key: "doppiaEsposizione", label: "Doppia esposizione" },
  { key: "ascensore", label: "Ascensore" },
  { key: "portineria", label: "Portineria" },
  { key: "ariaCondizionata", label: "Aria condizionata" },
  { key: "boxAuto", label: "Box auto / posto auto" },
  { key: "cantina", label: "Cantina / ripostiglio" },
  { key: "arredato", label: "Arredato" },
] as const;

// Punto di partenza: finché non ci sono ancora annunci veri nel database,
// usiamo le zone del prototipo. Quando ci saranno listing reali, questa
// lista potrà arrivare da `select distinct zona from listings`.
export const ZONE_MILANO = [
  "Navigli, Milano",
  "Isola, Milano",
  "Porta Romana, Milano",
  "Città Studi, Milano",
  "Bicocca, Milano",
  "Porta Nuova, Milano",
  "Porta Venezia, Milano",
  "Sempione, Milano",
  "Ticinese, Milano",
  "Loreto, Milano",
  "NoLo, Milano",
  "Certosa, Milano",
  "Lambrate, Milano",
] as const;
MATCHAMI_FILE_EOF

cat > "src/lib/affidabilita.ts" << 'MATCHAMI_FILE_EOF'
export type AffidabilitaInput = {
  verificato: boolean;
  protestato: boolean | null;
  garante: boolean | null;
  fideiussione: boolean | null;
  professione: string | null;
  reddito_mensile: number | null;
  mediaRecensioni: number | null; // null se nessuna recensione ancora
  numeroRecensioni: number;
};

export type AffidabilitaResult = {
  punteggio: number;
  label: "Da costruire" | "Buona" | "Molto buona" | "Eccellente";
  hasRecensioni: boolean;
  checks: { ok: boolean; label: string }[];
};

export function computeAffidabilita(p: AffidabilitaInput): AffidabilitaResult {
  const hasRecensioni = p.numeroRecensioni > 0;

  let punteggio = 45; // base, prima di qualunque verifica
  if (p.verificato) punteggio += 20;
  if (p.protestato === false) punteggio += 15;
  if (p.protestato === true) punteggio -= 30;
  if (p.garante === true || p.fideiussione === true) punteggio += 10;
  if (hasRecensioni && p.mediaRecensioni !== null) {
    punteggio += Math.round((p.mediaRecensioni - 3) * 6);
  }
  punteggio = Math.max(5, Math.min(99, Math.round(punteggio)));

  let label: AffidabilitaResult["label"] = "Da costruire";
  if (punteggio >= 85) label = "Eccellente";
  else if (punteggio >= 70) label = "Molto buona";
  else if (punteggio >= 50) label = "Buona";

  const checks = [
    {
      ok: !!p.professione,
      label: p.professione || "Situazione lavorativa da indicare",
    },
    {
      ok: !!p.reddito_mensile,
      label: p.reddito_mensile
        ? `Reddito dichiarato €${p.reddito_mensile.toLocaleString("it-IT")}/mese`
        : "Reddito da indicare",
    },
    {
      ok: p.verificato,
      label: p.verificato
        ? "Reddito verificato"
        : "Verifica reddito non ancora effettuata",
    },
    {
      ok: p.protestato === false,
      label:
        p.protestato === null
          ? "Controllo protesti da avviare"
          : p.protestato
            ? "Segnalazioni in centrale rischi"
            : "Nessun protesto o segnalazione",
    },
    {
      ok: p.garante === true || p.fideiussione === true,
      label:
        p.garante || p.fideiussione
          ? "Garante o fideiussione disponibile"
          : "Nessun garante indicato",
    },
  ];

  return { punteggio, label, hasRecensioni, checks };
}

export type CompletenessInput = {
  hasZone: boolean;
  professione: string | null;
  reddito_mensile: number | null;
  garante: boolean | null;
  animali: boolean | null;
  presentazione: string | null;
  nucleo: string | null;
  fideiussione: boolean | null;
};

export function computeProfileCompleteness(p: CompletenessInput): number {
  const fields = [
    p.hasZone,
    !!p.professione,
    !!p.reddito_mensile,
    p.garante !== null,
    p.animali !== null,
    (p.presentazione ?? "").trim().length > 10,
    p.nucleo !== null,
    p.fideiussione !== null,
  ];
  const filled = fields.filter(Boolean).length;
  return Math.round((filled / fields.length) * 100);
}
MATCHAMI_FILE_EOF

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
MATCHAMI_FILE_EOF

cat > "src/components/Sheet.tsx" << 'MATCHAMI_FILE_EOF'
"use client";

import { useEffect } from "react";

export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  // chiudi con Esc, comodo su desktop
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-ink/60"
        onClick={onClose}
        aria-hidden
      />
      <div className="absolute bottom-0 left-0 right-0 max-h-[88vh] overflow-y-auto bg-paper rounded-t-3xl px-5 pt-5 pb-8 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-lg text-ink">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Chiudi"
            className="text-ink/50 text-xl leading-none px-2"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
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

// Le schermate proprietario arrivano in un prossimo passo: per ora,
// se il ruolo è proprietario, mostriamo solo Home per non linkare
// a pagine che non esistono ancora.
const OWNER_TABS = [{ href: "/", label: "Home" }];

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

cat > "src/app/(app)/layout.tsx" << 'MATCHAMI_FILE_EOF'
import { createClient } from "@/lib/supabase/server";
import { TabBar } from "@/components/TabBar";

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
    .select("ruolo")
    .eq("id", user!.id)
    .single();

  const ruolo = profile?.ruolo ?? "inquilino";

  return (
    <div className="min-h-screen bg-paper">
      <div className="pb-24">{children}</div>
      <TabBar ruolo={ruolo} />
    </div>
  );
}
MATCHAMI_FILE_EOF

cat > "src/app/(app)/page.tsx" << 'MATCHAMI_FILE_EOF'
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("nome, ruolo")
    .eq("id", user!.id)
    .single();

  return (
    <div className="px-6 pt-16 pb-8 text-center flex flex-col items-center gap-3">
      <h1 className="font-display italic text-2xl text-ink">
        Match<span className="text-gold not-italic">AmI</span>
      </h1>
      <p className="text-sm text-ink/70">
        Ciao {profile?.nome ?? user!.email}! Sei registrato come{" "}
        <b>{profile?.ruolo}</b>.
      </p>
      <p className="text-xs text-ink/50 max-w-xs">
        Home ancora segnaposto: lo swipe delle case e il voto di
        affidabilità arrivano in un prossimo passo. Nel frattempo il
        Profilo, qui sotto, è già collegato al database vero.
      </p>
    </div>
  );
}
MATCHAMI_FILE_EOF

cat > "src/app/(app)/candidature/page.tsx" << 'MATCHAMI_FILE_EOF'
export default function CandidaturePage() {
  return (
    <div className="px-6 pt-16 text-center">
      <h1 className="font-display text-xl text-ink mb-2">Candidature</h1>
      <p className="text-xs text-ink/50 max-w-xs mx-auto">
        Qui vedrai lo stato delle tue candidature (in attesa, accettata,
        rifiutata). Arriva in un prossimo passo.
      </p>
    </div>
  );
}
MATCHAMI_FILE_EOF

cat > "src/app/(app)/gestione/page.tsx" << 'MATCHAMI_FILE_EOF'
export default function GestionePage() {
  return (
    <div className="px-6 pt-16 text-center">
      <h1 className="font-display text-xl text-ink mb-2">Gestione affitto</h1>
      <p className="text-xs text-ink/50 max-w-xs mx-auto">
        Contratto e bollette della casa che stai affittando. Arriva in un
        prossimo passo.
      </p>
    </div>
  );
}
MATCHAMI_FILE_EOF

cat > "src/app/(app)/profilo/actions.ts" << 'MATCHAMI_FILE_EOF'
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type SaveState = { error?: string; ok?: boolean } | null;

function parseBool(v: FormDataEntryValue | null): boolean | null {
  if (v === "true") return true;
  if (v === "false") return false;
  return null;
}

export async function updateDatiPersonali(
  _prevState: SaveState,
  formData: FormData
): Promise<SaveState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non autenticato." };

  const professione = String(formData.get("professione") || "") || null;
  const redditoRaw = formData.get("reddito_mensile");
  const reddito_mensile = redditoRaw ? Number(redditoRaw) : null;
  const garante = parseBool(formData.get("garante"));
  const protestato = parseBool(formData.get("protestato"));
  const fideiussione = parseBool(formData.get("fideiussione"));
  const animali = parseBool(formData.get("animali"));
  const nucleo = String(formData.get("nucleo") || "") || null;
  const figli = Number(formData.get("figli") || 0);
  const redditi_nucleo = Number(formData.get("redditi_nucleo") || 1);
  const presentazione = String(formData.get("presentazione") || "");

  const { error } = await supabase
    .from("tenant_profiles")
    .update({
      professione,
      reddito_mensile,
      garante,
      protestato,
      fideiussione,
      animali,
      nucleo,
      figli,
      redditi_nucleo,
      presentazione,
      updated_at: new Date().toISOString(),
    })
    .eq("profile_id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/profilo");
  return { ok: true };
}

export async function updateRicerca(
  _prevState: SaveState,
  formData: FormData
): Promise<SaveState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non autenticato." };

  const budget_max = Number(formData.get("budget_max") || 0);
  const locali_min = Number(formData.get("locali_min") || 1);
  const mq_min = Number(formData.get("mq_min") || 25);

  let zone: string[] = [];
  let interessi: Record<string, number> = {};
  try {
    zone = JSON.parse(String(formData.get("zone") || "[]"));
  } catch {
    zone = [];
  }
  try {
    interessi = JSON.parse(String(formData.get("interessi") || "{}"));
  } catch {
    interessi = {};
  }

  const { error: eProfile } = await supabase
    .from("tenant_profiles")
    .update({
      budget_max,
      locali_min,
      mq_min,
      updated_at: new Date().toISOString(),
    })
    .eq("profile_id", user.id);
  if (eProfile) return { error: eProfile.message };

  // Zone: sostituiamo tutta la lista (semplice e corretto per un set piccolo)
  const { error: eDelZone } = await supabase
    .from("tenant_zone_interesse")
    .delete()
    .eq("tenant_id", user.id);
  if (eDelZone) return { error: eDelZone.message };

  if (zone.length > 0) {
    const { error: eInsZone } = await supabase
      .from("tenant_zone_interesse")
      .insert(zone.map((zona) => ({ tenant_id: user.id, zona })));
    if (eInsZone) return { error: eInsZone.message };
  }

  // Interessi: stessa logica, sostituiamo tutto
  const { error: eDelInt } = await supabase
    .from("tenant_interessi")
    .delete()
    .eq("tenant_id", user.id);
  if (eDelInt) return { error: eDelInt.message };

  const entries = Object.entries(interessi).filter(([, peso]) => peso > 0);
  if (entries.length > 0) {
    const { error: eInsInt } = await supabase.from("tenant_interessi").insert(
      entries.map(([attributo_key, peso]) => ({
        tenant_id: user.id,
        attributo_key,
        peso,
      }))
    );
    if (eInsInt) return { error: eInsInt.message };
  }

  revalidatePath("/profilo");
  return { ok: true };
}
MATCHAMI_FILE_EOF

cat > "src/app/(app)/profilo/page.tsx" << 'MATCHAMI_FILE_EOF'
import { createClient } from "@/lib/supabase/server";
import { ProfiloClient } from "./ProfiloClient";
import type { TenantProfile } from "@/lib/types";

export default async function ProfiloPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [
    { data: profile },
    { data: tenant },
    { data: zoneRows },
    { data: interessiRows },
    { data: recensioni },
  ] = await Promise.all([
    supabase.from("profiles").select("nome, cognome").eq("id", user!.id).single(),
    supabase
      .from("tenant_profiles")
      .select("*")
      .eq("profile_id", user!.id)
      .single(),
    supabase.from("tenant_zone_interesse").select("zona").eq("tenant_id", user!.id),
    supabase
      .from("tenant_interessi")
      .select("attributo_key, peso")
      .eq("tenant_id", user!.id),
    supabase.from("recensioni").select("voto").eq("tenant_id", user!.id),
  ]);

  const zoneIniziali = (zoneRows ?? []).map((r) => r.zona as string);
  const interessiIniziali = Object.fromEntries(
    (interessiRows ?? []).map((r) => [r.attributo_key as string, r.peso as number])
  );
  const numeroRecensioni = recensioni?.length ?? 0;
  const mediaRecensioni =
    numeroRecensioni > 0
      ? recensioni!.reduce((s, r) => s + (r.voto as number), 0) / numeroRecensioni
      : null;

  return (
    <ProfiloClient
      nome={profile?.nome ?? null}
      cognome={profile?.cognome ?? null}
      tenant={tenant as TenantProfile}
      zoneIniziali={zoneIniziali}
      interessiIniziali={interessiIniziali}
      mediaRecensioni={mediaRecensioni}
      numeroRecensioni={numeroRecensioni}
    />
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
    <div className="px-5 pt-6 pb-8 max-w-md mx-auto">
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
    </div>
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

function Chip({
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
      className={`text-xs font-semibold px-3 py-2 rounded-full border transition-colors ${
        active
          ? "bg-moss/15 border-moss text-moss"
          : "bg-ink/5 border-transparent text-ink/60"
      }`}
    >
      {label}
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

function Field({
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

function Stepper({
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

echo "Fatto. Ora lancio la build per verificare..."
npm run build
