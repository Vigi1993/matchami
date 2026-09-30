#!/usr/bin/env bash
set -e
echo "Applico Gestione affitti proprietario (Fase 4 - Step 8)..."

mkdir -p "src/app/(app)/gestione-affitti"
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

// Resta solo il Profilo proprietario da costruire.
const OWNER_TABS = [
  { href: "/", label: "Home" },
  { href: "/database", label: "Database" },
  { href: "/immobili", label: "Immobili" },
  { href: "/gestione-affitti", label: "Gestione affitti" },
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

cat > "src/app/(app)/gestione-affitti/actions.ts" << 'MATCHAMI_FILE_EOF'
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type SaveState = { error?: string; ok?: boolean } | null;

export async function creaContratto(
  _prevState: SaveState,
  formData: FormData
): Promise<SaveState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non autenticato." };

  const candidaturaId = String(formData.get("candidatura_id") || "");
  if (!candidaturaId) return { error: "Candidatura non trovata." };

  const canone = Number(formData.get("canone") || 0) || null;
  const durata_mesi = Number(formData.get("durata_mesi") || 0) || null;
  const data_inizio = String(formData.get("data_inizio") || "") || null;
  const stato = String(formData.get("stato") || "bozza");

  const { error } = await supabase.from("contratti").insert({
    candidatura_id: candidaturaId,
    stato,
    canone,
    durata_mesi,
    data_inizio,
  });

  if (error) return { error: error.message };

  revalidatePath("/gestione-affitti");
  return { ok: true };
}

export async function aggiornaContratto(
  _prevState: SaveState,
  formData: FormData
): Promise<SaveState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non autenticato." };

  const id = String(formData.get("id") || "");
  if (!id) return { error: "Contratto non trovato." };

  const canone = Number(formData.get("canone") || 0) || null;
  const durata_mesi = Number(formData.get("durata_mesi") || 0) || null;
  const data_inizio = String(formData.get("data_inizio") || "") || null;
  const data_firma = String(formData.get("data_firma") || "") || null;
  const stato = String(formData.get("stato") || "bozza");

  const { error } = await supabase
    .from("contratti")
    .update({
      stato,
      canone,
      durata_mesi,
      data_inizio,
      data_firma,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/gestione-affitti");
  return { ok: true };
}
MATCHAMI_FILE_EOF

cat > "src/app/(app)/gestione-affitti/page.tsx" << 'MATCHAMI_FILE_EOF'
import { createClient } from "@/lib/supabase/server";
import { GestioneAffittiClient } from "./GestioneAffittiClient";
import type { CandidaturaSenzaContratto, ContrattoProprietario } from "@/lib/types";

export default async function GestioneAffittiPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Candidature accettate sui miei annunci
  const { data: accettate } = await supabase
    .from("candidature")
    .select("id, tenant_id, listings!inner(owner_id, titolo, zona)")
    .eq("listings.owner_id", user!.id)
    .eq("status", "accettata");

  // Contratti già esistenti, per capire quali candidature ne sono ancora prive
  const { data: contratti } = await supabase
    .from("contratti")
    .select(
      "id, candidatura_id, stato, canone, durata_mesi, data_inizio, data_firma, candidature!inner(listing_id, tenant_id, listings(owner_id, titolo, zona))"
    )
    .eq("candidature.listings.owner_id", user!.id)
    .order("created_at", { ascending: false });

  const candidatureConContratto = new Set(
    (contratti ?? []).map((c) => c.candidatura_id as string)
  );
  const senzaContratto = (accettate ?? []).filter(
    (c) => !candidatureConContratto.has(c.id)
  );

  // nomi/cognomi degli inquilini coinvolti (candidature senza contratto)
  const tenantIds = [...new Set(senzaContratto.map((c) => c.tenant_id as string))];
  const { data: profiliSenza } =
    tenantIds.length > 0
      ? await supabase.from("profiles").select("id, nome, cognome").in("id", tenantIds)
      : { data: [] };
  const nomiSenzaContratto = new Map(
    (profiliSenza ?? []).map((p) => [p.id as string, { nome: p.nome, cognome: p.cognome }])
  );

  const candidatureSenzaContratto: CandidaturaSenzaContratto[] = senzaContratto.map(
    (c) => ({
      id: c.id,
      listings: c.listings as unknown as { titolo: string; zona: string },
      nome: nomiSenzaContratto.get(c.tenant_id as string)?.nome ?? null,
      cognome: nomiSenzaContratto.get(c.tenant_id as string)?.cognome ?? null,
    })
  );

  // nomi/cognomi per i contratti esistenti
  const tenantIdsContratti = [
    ...new Set(
      (contratti ?? []).map(
        (c) => (c.candidature as unknown as { tenant_id: string })?.tenant_id
      )
    ),
  ].filter(Boolean) as string[];
  const { data: profiliContratti } =
    tenantIdsContratti.length > 0
      ? await supabase.from("profiles").select("id, nome, cognome").in("id", tenantIdsContratti)
      : { data: [] };
  const nomiContratti = new Map(
    (profiliContratti ?? []).map((p) => [p.id as string, { nome: p.nome, cognome: p.cognome }])
  );

  const contrattiCompleti: ContrattoProprietario[] = (
    (contratti ?? []) as unknown as ContrattoProprietario[]
  ).map((c) => {
    const tenantId = c.candidature?.tenant_id ?? "";
    return {
      ...c,
      nome: nomiContratti.get(tenantId)?.nome ?? null,
      cognome: nomiContratti.get(tenantId)?.cognome ?? null,
    };
  });

  return (
    <GestioneAffittiClient
      candidatureSenzaContratto={candidatureSenzaContratto}
      contratti={contrattiCompleti}
    />
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
    <div className="px-5 pt-6 pb-8 max-w-md mx-auto">
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
    </div>
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
MATCHAMI_FILE_EOF

echo "Fatto. Ora lancio la build per verificare..."
rm -rf .next
npm run build
