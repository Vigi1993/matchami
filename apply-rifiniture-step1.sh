#!/usr/bin/env bash
set -e
echo "Applico le rifiniture: Privacy/FAQ funzionanti, swipe vero, upload foto reale..."

mkdir -p "src/app/(app)"
mkdir -p "src/app/(app)/immobili"
mkdir -p "src/app/(app)/profilo"
mkdir -p "src/components"
mkdir -p "supabase/migrations"

cat > "src/app/(app)/profilo/privacy-actions.ts" << 'MATCHAMI_FILE_EOF'
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type SaveState = { error?: string; ok?: boolean } | null;

export async function updatePrivacy(
  _prevState: SaveState,
  formData: FormData
): Promise<SaveState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non autenticato." };

  const consenso_marketing = formData.get("consenso_marketing") === "true";
  const consenso_terzi = formData.get("consenso_terzi") === "true";

  const { error } = await supabase
    .from("profiles")
    .update({ consenso_marketing, consenso_terzi })
    .eq("id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/profilo");
  return { ok: true };
}
MATCHAMI_FILE_EOF

cat > "src/components/PrivacySheet.tsx" << 'MATCHAMI_FILE_EOF'
"use client";

import { useActionState, useEffect, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { Chip } from "@/components/ui/Chip";
import { Field } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import {
  updatePrivacy,
  type SaveState,
} from "@/app/(app)/profilo/privacy-actions";

export function PrivacySheet({
  open,
  onClose,
  consensoMarketingIniziale,
  consensoTerziIniziale,
}: {
  open: boolean;
  onClose: () => void;
  consensoMarketingIniziale: boolean;
  consensoTerziIniziale: boolean;
}) {
  const [state, formAction, pending] = useActionState<SaveState, FormData>(
    updatePrivacy,
    null
  );
  const [marketing, setMarketing] = useState(consensoMarketingIniziale);
  const [terzi, setTerzi] = useState(consensoTerziIniziale);

  useEffect(() => {
    if (state?.ok) {
      const t = setTimeout(onClose, 600);
      return () => clearTimeout(t);
    }
  }, [state, onClose]);

  return (
    <Sheet open={open} onClose={onClose} title="Privacy e consensi">
      <p className="text-xs text-ink/60 mb-5">
        Il trattamento dei dati necessario al funzionamento di MatchAmI
        (creare il profilo, gestire candidature e contratti) è sempre
        attivo: senza non potremmo farti usare l&apos;app. Qui puoi
        decidere solo sui consensi facoltativi.
      </p>
      <form action={formAction} className="flex flex-col gap-5">
        <input
          type="hidden"
          name="consenso_marketing"
          value={String(marketing)}
        />
        <input type="hidden" name="consenso_terzi" value={String(terzi)} />

        <Field label="Marketing MatchAmI">
          <p className="text-xs text-ink/50 mb-2">
            Email e notifiche su nuovi annunci, promozioni e novità del
            servizio.
          </p>
          <div className="flex gap-2">
            <Chip label="Sì" active={marketing} onClick={() => setMarketing(true)} />
            <Chip label="No" active={!marketing} onClick={() => setMarketing(false)} />
          </div>
        </Field>

        <Field label="Condivisione con partner terzi">
          <p className="text-xs text-ink/50 mb-2">
            Offerte di servizi collegati alla casa (utenze, assicurazioni,
            mutui) da parte di partner commerciali di MatchAmI.
          </p>
          <div className="flex gap-2">
            <Chip label="Sì" active={terzi} onClick={() => setTerzi(true)} />
            <Chip label="No" active={!terzi} onClick={() => setTerzi(false)} />
          </div>
        </Field>

        {state?.error && <p className="text-clay text-xs">{state.error}</p>}
        {state?.ok && <p className="text-moss text-xs">Salvato.</p>}

        <Button type="submit" disabled={pending}>
          {pending ? "Salvataggio..." : "Salva preferenze"}
        </Button>
      </form>
    </Sheet>
  );
}
MATCHAMI_FILE_EOF

cat > "src/components/FaqSheet.tsx" << 'MATCHAMI_FILE_EOF'
"use client";

import { Sheet } from "@/components/Sheet";

const FAQ = [
  {
    q: "Bonus giovani per l'affitto",
    a: "Diverse misure nazionali e regionali prevedono agevolazioni per chi ha meno di 31 anni e affitta un immobile lontano dalla residenza dei genitori. Requisiti e importi cambiano spesso: verifica sul sito dell'Agenzia delle Entrate o del tuo Comune quali sono attive quest'anno.",
  },
  {
    q: "Detrazioni 730 per l'affitto",
    a: "Chi vive in affitto come abitazione principale può avere diritto a una detrazione IRPEF, con importi diversi in base al reddito e al tipo di contratto (libero, concordato, giovani under 31). Il commercialista o il CAF che ti segue può calcolare l'importo esatto in base alla tua situazione.",
  },
  {
    q: "Contributi comunali per l'affitto",
    a: "Molti Comuni, incluso il Comune di Milano, pubblicano periodicamente bandi di sostegno all'affitto per chi rientra in determinate fasce ISEE. Le finestre di apertura cambiano ogni anno: conviene controllare direttamente sul sito del proprio Comune.",
  },
  {
    q: "Cos'è la fideiussione bancaria/assicurativa",
    a: "È una garanzia che una banca o un'assicurazione offre al posto (o in aggiunta) al deposito cauzionale: se l'inquilino non paga, interviene l'ente garante. Va attivata con un intermediario finanziario, non è ancora un servizio diretto di MatchAmI.",
  },
  {
    q: "Come funziona il voto di affidabilità",
    a: "Combina le recensioni ricevute nei contratti conclusi su MatchAmI con le verifiche sul tuo stato economico (reddito dichiarato, eventuale verifica, garante, assenza di protesti). Più informazioni fornisci e più solida è la tua storia, più il punteggio sale.",
  },
];

export function FaqSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="FAQ e bonus affitto">
      <div className="flex flex-col gap-5">
        {FAQ.map((item) => (
          <div key={item.q}>
            <div className="font-display font-bold text-sm text-ink mb-1">
              {item.q}
            </div>
            <p className="text-xs text-ink/60 leading-relaxed">{item.a}</p>
          </div>
        ))}
        <p className="text-[11px] text-ink/40 leading-relaxed border-t border-ink/10 pt-4">
          Informazioni a scopo indicativo: requisiti e importi di bonus,
          detrazioni e contributi possono cambiare nel tempo. Per la tua
          situazione specifica verifica sempre le fonti ufficiali (Agenzia
          delle Entrate, Comune) o parla con un commercialista/CAF.
        </p>
      </div>
    </Sheet>
  );
}
MATCHAMI_FILE_EOF

cat > "supabase/migrations/0005_storage_immobili_foto.sql" << 'MATCHAMI_FILE_EOF'
-- ============================================================
-- MatchAmI — Fase 4/rifiniture: upload foto reale via Supabase Storage
--
-- NOTA IMPORTANTE: questa migrazione usa lo schema "storage" che esiste
-- solo su un progetto Supabase vero, non su un Postgres qualunque — non
-- ho potuto testarla sul mio Postgres locale come le altre. Segue però
-- lo schema standard documentato da Supabase per gli upload "una cartella
-- per utente", verificalo comunque dopo averlo eseguito (prova a caricare
-- una foto da Immobili).
-- ============================================================

-- Bucket pubblico: le foto degli annunci devono essere visibili a chiunque
-- navighi il portale, anche senza account.
insert into storage.buckets (id, name, public)
values ('immobili-foto', 'immobili-foto', true)
on conflict (id) do nothing;

-- Lettura: aperta a tutti (il bucket è pubblico, ma la policy esplicita
-- serve comunque per le richieste autenticate lato client).
create policy "immobili-foto: lettura pubblica" on storage.objects
  for select using (bucket_id = 'immobili-foto');

-- Scrittura: ogni proprietario può caricare solo dentro una cartella con
-- il proprio user id come primo segmento del percorso (es. "<uid>/foto.jpg").
create policy "immobili-foto: upload nella propria cartella" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'immobili-foto'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "immobili-foto: aggiorna nella propria cartella" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'immobili-foto'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "immobili-foto: elimina dalla propria cartella" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'immobili-foto'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
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
    .select("nome, cognome, ruolo, consenso_marketing, consenso_terzi")
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
        consensoMarketingIniziale={profile?.consenso_marketing ?? false}
        consensoTerziIniziale={profile?.consenso_terzi ?? false}
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
      consensoMarketingIniziale={profile?.consenso_marketing ?? false}
      consensoTerziIniziale={profile?.consenso_terzi ?? false}
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
import { PageContainer } from "@/components/ui/PageContainer";
import { Chip } from "@/components/ui/Chip";
import { Field } from "@/components/ui/Field";
import { Stepper } from "@/components/ui/Stepper";
import { PrivacySheet } from "@/components/PrivacySheet";
import { FaqSheet } from "@/components/FaqSheet";

type Props = {
  nome: string | null;
  cognome: string | null;
  tenant: TenantProfile;
  zoneIniziali: string[];
  interessiIniziali: Record<string, number>;
  mediaRecensioni: number | null;
  numeroRecensioni: number;
  consensoMarketingIniziale: boolean;
  consensoTerziIniziale: boolean;
};

export function ProfiloClient({
  nome,
  tenant,
  zoneIniziali,
  interessiIniziali,
  mediaRecensioni,
  numeroRecensioni,
  consensoMarketingIniziale,
  consensoTerziIniziale,
}: Props) {
  const [sheetAperta, setSheetAperta] = useState<
    "affidabilita" | "dati" | "ricerca" | "privacy" | "faq" | null
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

      {/* Privacy / FAQ */}
      <Row
        color="var(--moss)"
        title="Privacy e consensi"
        subtitle="Rivedi o modifica i consensi su marketing e condivisione dati con terzi."
        cta="Gestisci consensi"
        onClick={() => setSheetAperta("privacy")}
      />
      <Row
        color="var(--gold)"
        title="FAQ e bonus affitto"
        subtitle="Bonus giovani, contributo Comune di Milano, detrazioni 730 e altre curiosità."
        cta="Vedi le domande frequenti"
        onClick={() => setSheetAperta("faq")}
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

      {/* ---- Sheet: Privacy e FAQ ---- */}
      <PrivacySheet
        open={sheetAperta === "privacy"}
        onClose={() => setSheetAperta(null)}
        consensoMarketingIniziale={consensoMarketingIniziale}
        consensoTerziIniziale={consensoTerziIniziale}
      />
      <FaqSheet open={sheetAperta === "faq"} onClose={() => setSheetAperta(null)} />
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
import { PrivacySheet } from "@/components/PrivacySheet";
import { FaqSheet } from "@/components/FaqSheet";

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
  consensoMarketingIniziale,
  consensoTerziIniziale,
}: {
  nome: string | null;
  owner: OwnerProfile;
  consensoMarketingIniziale: boolean;
  consensoTerziIniziale: boolean;
}) {
  const [datiAperto, setDatiAperto] = useState(false);
  const [privacyAperto, setPrivacyAperto] = useState(false);
  const [faqAperto, setFaqAperto] = useState(false);

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
        onClick={() => setPrivacyAperto(true)}
      />
      <Row
        color="var(--gold)"
        title="FAQ"
        subtitle="Domande frequenti su MatchAmI per i proprietari."
        cta="Vedi le domande frequenti"
        onClick={() => setFaqAperto(true)}
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

      <PrivacySheet
        open={privacyAperto}
        onClose={() => setPrivacyAperto(false)}
        consensoMarketingIniziale={consensoMarketingIniziale}
        consensoTerziIniziale={consensoTerziIniziale}
      />
      <FaqSheet open={faqAperto} onClose={() => setFaqAperto(false)} />
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

cat > "src/app/(app)/HomeClient.tsx" << 'MATCHAMI_FILE_EOF'
"use client";

import { useRef, useState, useTransition } from "react";
import type { AffidabilitaResult } from "@/lib/affidabilita";
import type { ListingConFoto } from "@/lib/types";
import { candidati } from "./actions";
import { PageContainer } from "@/components/ui/PageContainer";

const SOGLIA_SWIPE = 100; // px di trascinamento oltre cui la scelta è "decisa"

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

  // ---- stato del trascinamento della card ----
  const [drag, setDrag] = useState({ x: 0, y: 0, dragging: false });
  const [exiting, setExiting] = useState<"left" | "right" | null>(null);
  const startPos = useRef({ x: 0, y: 0 });

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

  // Azionata sia dal rilascio del trascinamento sia dai pulsanti: fa
  // "volare via" la card nella direzione scelta, poi passa alla prossima.
  function swipe(direzione: "left" | "right") {
    if (!attuale || pending) return;
    setExiting(direzione);
    setTimeout(() => {
      if (direzione === "right") candidati_(attuale);
      else scarta();
      setDrag({ x: 0, y: 0, dragging: false });
      setExiting(null);
    }, 220);
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (exiting) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    startPos.current = { x: e.clientX, y: e.clientY };
    setDrag({ x: 0, y: 0, dragging: true });
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!drag.dragging) return;
    setDrag({
      x: e.clientX - startPos.current.x,
      y: e.clientY - startPos.current.y,
      dragging: true,
    });
  }

  function onPointerUp() {
    if (!drag.dragging) return;
    if (drag.x > SOGLIA_SWIPE) swipe("right");
    else if (drag.x < -SOGLIA_SWIPE) swipe("left");
    else setDrag({ x: 0, y: 0, dragging: false });
  }

  const rotazione = drag.x / 18;
  const transformStyle =
    exiting === "right"
      ? "translate(160%, 40px) rotate(28deg)"
      : exiting === "left"
        ? "translate(-160%, 40px) rotate(-28deg)"
        : `translate(${drag.x}px, ${drag.y}px) rotate(${rotazione}deg)`;
  const likeOpacity = Math.min(Math.max(drag.x / SOGLIA_SWIPE, 0), 1);
  const nopeOpacity = Math.min(Math.max(-drag.x / SOGLIA_SWIPE, 0), 1);

  return (
    <PageContainer>
      <div className="md:grid md:grid-cols-[300px_1fr] md:gap-10 md:items-start">
        {/* ---- Colonna sinistra su desktop: affidabilità + conteggio, resta visibile mentre scorri ---- */}
        <div className="bg-ink text-paper rounded-2xl p-5 mb-6 md:mb-0 md:p-7 md:sticky md:top-10">
          <div className="flex items-center justify-between md:flex-col md:items-start md:gap-8">
            <div>
              <div className="text-2xl md:text-5xl font-display font-bold text-gold">
                {affidabilita.punteggio}
              </div>
              <div className="text-[10px] md:text-sm text-paper/60 leading-tight mt-1">
                Affidabilità
                <br />
                <b className="text-paper">{affidabilita.label}</b>
              </div>
            </div>
            <div className="text-right md:text-left text-[10px] md:text-sm text-paper/80 leading-tight">
              <b className="text-paper text-base md:text-3xl md:block md:mb-1">
                {listings.length}
              </b>{" "}
              casa{listings.length === 1 ? "" : "e"} in linea
              <br />
              con la tua ricerca
            </div>
          </div>
        </div>

        {/* ---- Colonna destra su desktop: stato vuoto / esaurito / card corrente ---- */}
        <div>
          {/* ---- Nessun annuncio ---- */}
          {listings.length === 0 && (
            <div className="bg-ink/5 rounded-2xl p-5 md:p-10 text-center">
              <div className="w-11 h-11 rounded-full bg-gold/20 mx-auto mb-3" />
              <h3 className="font-display font-bold text-sm md:text-base text-ink mb-1">
                Nessun annuncio in linea con la tua ricerca
              </h3>
              <p className="text-xs md:text-sm text-ink/50 max-w-xs mx-auto">
                Appena ci saranno immobili pubblicati che rientrano nei tuoi
                criteri, li vedrai qui. Nel frattempo puoi aggiornare i
                criteri in Profilo → La tua ricerca.
              </p>
            </div>
          )}

          {/* ---- Deck esaurito ---- */}
          {listings.length > 0 && finito && (
            <div className="bg-ink/5 rounded-2xl p-5 md:p-10 text-center">
              <h3 className="font-display font-bold text-sm md:text-base text-ink mb-1">
                Hai visto tutti gli annunci disponibili
              </h3>
              <p className="text-xs md:text-sm text-ink/50">
                Torna più tardi: ne arrivano di nuovi appena vengono
                pubblicati.
              </p>
            </div>
          )}

          {/* ---- Card corrente (trascinabile) ---- */}
          {attuale && !finito && (
            <div className="flex flex-col gap-4 md:max-w-md md:mx-auto">
              <div
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                style={{
                  transform: transformStyle,
                  transition: drag.dragging
                    ? "none"
                    : "transform 0.22s ease-out",
                  touchAction: "pan-y",
                }}
                className="relative rounded-3xl overflow-hidden bg-ink h-[420px] md:h-[540px] cursor-grab active:cursor-grabbing select-none"
              >
                {attuale.listing_photos?.[0]?.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={attuale.listing_photos[0].url}
                    alt={attuale.titolo}
                    draggable={false}
                    className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="font-display italic text-5xl text-paper/15">
                      {attuale.titolo.slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                )}

                {/* Timbri LIKE / NOPE, sfumano mentre trascini */}
                <div
                  style={{ opacity: likeOpacity }}
                  className="absolute top-6 left-6 border-4 border-moss text-moss font-display font-bold text-2xl px-3 py-1 rounded-xl -rotate-12 pointer-events-none"
                >
                  MI PIACE
                </div>
                <div
                  style={{ opacity: nopeOpacity }}
                  className="absolute top-6 right-6 border-4 border-clay text-clay font-display font-bold text-2xl px-3 py-1 rounded-xl rotate-12 pointer-events-none"
                >
                  NO
                </div>

                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/90 to-transparent p-4 md:p-6 pointer-events-none">
                  <div className="font-display font-bold text-paper md:text-lg">
                    {attuale.titolo}
                  </div>
                  <div className="text-xs md:text-sm text-paper/70">
                    {attuale.zona} · €{attuale.prezzo.toLocaleString("it-IT")}
                    /mese
                    {attuale.locali && ` · ${attuale.locali} locali`}
                    {attuale.mq && ` · ${attuale.mq} m²`}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-center gap-6">
                <button
                  onClick={() => swipe("left")}
                  disabled={pending}
                  aria-label="Scarta"
                  className="w-14 h-14 rounded-full border-2 border-clay text-clay flex items-center justify-center text-2xl disabled:opacity-50"
                >
                  ✕
                </button>
                <button
                  onClick={() => swipe("right")}
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
        </div>
      </div>

      {candidatureInviate.size > 0 && (
        <p className="text-center text-xs text-moss mt-4">
          Candidatura inviata — la trovi in &quot;Candidature&quot;.
        </p>
      )}
    </PageContainer>
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
import { createClient } from "@/lib/supabase/client";
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
    <PageContainer wide>
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
        <div className="flex flex-col gap-3 md:grid md:grid-cols-2 md:gap-4 lg:grid-cols-3">
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
  const [fotoUrl, setFotoUrl] = useState(immobile?.fotoUrl ?? "");
  const [caricamentoFoto, setCaricamentoFoto] = useState(false);
  const [erroreFoto, setErroreFoto] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setCaricamentoFoto(true);
    setErroreFoto(null);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setErroreFoto("Devi essere autenticato.");
      setCaricamentoFoto(false);
      return;
    }

    const estensione = file.name.split(".").pop() || "jpg";
    const percorso = `${user.id}/${crypto.randomUUID()}.${estensione}`;

    const { error } = await supabase.storage
      .from("immobili-foto")
      .upload(percorso, file, { upsert: true });

    if (error) {
      setErroreFoto(error.message);
      setCaricamentoFoto(false);
      return;
    }

    const { data } = supabase.storage
      .from("immobili-foto")
      .getPublicUrl(percorso);

    setFotoUrl(data.publicUrl);
    setCaricamentoFoto(false);
  }

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
      <input type="hidden" name="fotoUrl" value={fotoUrl} />

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

      <Field label="Foto principale">
        <div className="flex items-center gap-4">
          {fotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={fotoUrl}
              alt="Anteprima"
              className="w-20 h-20 rounded-xl object-cover bg-ink/10 shrink-0"
            />
          ) : (
            <div className="w-20 h-20 rounded-xl bg-ink/10 shrink-0" />
          )}
          <div className="flex-1">
            <input
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              disabled={caricamentoFoto}
              className="text-xs text-ink/70 file:mr-3 file:py-2 file:px-3 file:rounded-full file:border-0 file:bg-ink/10 file:text-xs file:font-semibold file:text-ink"
            />
            {caricamentoFoto && (
              <p className="text-[11px] text-ink/40 mt-1">Caricamento...</p>
            )}
            {erroreFoto && (
              <p className="text-[11px] text-clay mt-1">{erroreFoto}</p>
            )}
          </div>
        </div>
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

echo "Fatto. Ora lancio la build per verificare..."
rm -rf .next
npm run build
echo ""
echo "IMPORTANTE: esegui anche supabase/migrations/0005_storage_immobili_foto.sql nell'SQL Editor di Supabase (crea il bucket per le foto degli annunci)."
