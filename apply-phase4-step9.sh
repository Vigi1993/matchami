#!/usr/bin/env bash
set -e
echo "Applico il Profilo proprietario (Fase 4 - Step 9, ultimo)..."

mkdir -p "src/app/(app)/profilo"
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

export type OwnerProfile = {
  profile_id: string;
  proprietario_tipo: "privato" | "agenzia" | "property_manager" | null;
  num_immobili: number;
  obiettivo: string | null;
};

export type ImmobileDettaglio = {
  id: string;
  titolo: string;
  descrizione: string | null;
  zona: string;
  prezzo: number;
  locali: number | null;
  mq: number | null;
  attributi: Record<string, boolean>;
  pubblicato: boolean;
  fotoUrl: string | null;
  nCandidature: number;
};

export type CandidaturaSenzaContratto = {
  id: string;
  listings: { titolo: string; zona: string } | null;
  nome: string | null;
  cognome: string | null;
};

export type ContrattoProprietario = {
  id: string;
  stato: StatoContratto;
  canone: number | null;
  durata_mesi: number | null;
  data_inizio: string | null;
  data_firma: string | null;
  candidature: {
    listings: { titolo: string; zona: string } | null;
    tenant_id: string;
  } | null;
  nome?: string | null;
  cognome?: string | null;
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

const OWNER_TABS = [
  { href: "/", label: "Home" },
  { href: "/database", label: "Database" },
  { href: "/immobili", label: "Immobili" },
  { href: "/gestione-affitti", label: "Gestione affitti" },
  { href: "/profilo", label: "Profilo" },
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

cat > "src/app/(app)/profilo/page.tsx" << 'MATCHAMI_FILE_EOF'
import { createClient } from "@/lib/supabase/server";
import { ProfiloClient } from "./ProfiloClient";
import { OwnerProfiloClient } from "./OwnerProfiloClient";
import type { TenantProfile, OwnerProfile } from "@/lib/types";

export default async function ProfiloPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("nome, cognome, ruolo")
    .eq("id", user!.id)
    .single();

  if (profile?.ruolo === "proprietario") {
    const { data: owner } = await supabase
      .from("owner_profiles")
      .select("*")
      .eq("profile_id", user!.id)
      .single();

    return (
      <OwnerProfiloClient
        nome={profile?.nome ?? null}
        owner={owner as OwnerProfile}
      />
    );
  }

  const [
    { data: tenant },
    { data: zoneRows },
    { data: interessiRows },
    { data: recensioni },
  ] = await Promise.all([
    supabase.from("tenant_profiles").select("*").eq("profile_id", user!.id).single(),
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

cat > "src/app/(app)/profilo/owner-actions.ts" << 'MATCHAMI_FILE_EOF'
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type SaveState = { error?: string; ok?: boolean } | null;

export async function updateDatiProprietario(
  _prevState: SaveState,
  formData: FormData
): Promise<SaveState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non autenticato." };

  const proprietario_tipo = String(formData.get("proprietario_tipo") || "") || null;
  const num_immobili = Number(formData.get("num_immobili") || 1);
  const obiettivo = String(formData.get("obiettivo") || "") || null;

  const { error } = await supabase
    .from("owner_profiles")
    .update({
      proprietario_tipo,
      num_immobili,
      obiettivo,
      updated_at: new Date().toISOString(),
    })
    .eq("profile_id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/profilo");
  return { ok: true };
}
MATCHAMI_FILE_EOF

cat > "src/app/(app)/profilo/OwnerProfiloClient.tsx" << 'MATCHAMI_FILE_EOF'
"use client";

import { useActionState, useEffect, useState } from "react";
import { Sheet } from "@/components/Sheet";
import type { OwnerProfile } from "@/lib/types";
import { updateDatiProprietario, type SaveState } from "./owner-actions";
import { logout } from "@/app/login/actions";

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
    <div className="px-5 pt-6 pb-8 max-w-md mx-auto">
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
    </div>
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

echo "Fatto. Ora lancio la build per verificare..."
rm -rf .next
npm run build
