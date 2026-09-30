#!/usr/bin/env bash
set -e
echo "Applico Immobili (Fase 4 - Step 7)..."

mkdir -p "src/app/(app)/immobili"
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

// Le altre schermate proprietario (Gestione affitti, Profilo) arrivano
// nei prossimi passi.
const OWNER_TABS = [
  { href: "/", label: "Home" },
  { href: "/database", label: "Database" },
  { href: "/immobili", label: "Immobili" },
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

cat > "src/app/(app)/immobili/actions.ts" << 'MATCHAMI_FILE_EOF'
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type SaveState = { error?: string; ok?: boolean } | null;

function parseAttributi(raw: FormDataEntryValue | null): Record<string, boolean> {
  try {
    const obj = JSON.parse(String(raw || "{}"));
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}

export async function creaImmobile(
  _prevState: SaveState,
  formData: FormData
): Promise<SaveState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non autenticato." };

  const titolo = String(formData.get("titolo") || "").trim();
  const zona = String(formData.get("zona") || "").trim();
  const prezzo = Number(formData.get("prezzo") || 0);
  if (!titolo || !zona || !prezzo) {
    return { error: "Titolo, zona e canone sono obbligatori." };
  }

  const descrizione = String(formData.get("descrizione") || "") || null;
  const locali = Number(formData.get("locali") || 0) || null;
  const mq = Number(formData.get("mq") || 0) || null;
  const attributi = parseAttributi(formData.get("attributi"));
  const pubblicato = formData.get("pubblicato") === "true";
  const fotoUrl = String(formData.get("fotoUrl") || "").trim();

  const { data: listing, error } = await supabase
    .from("listings")
    .insert({
      owner_id: user.id,
      titolo,
      descrizione,
      zona,
      prezzo,
      locali,
      mq,
      attributi,
      pubblicato,
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  if (fotoUrl && listing) {
    const { error: eFoto } = await supabase
      .from("listing_photos")
      .insert({ listing_id: listing.id, url: fotoUrl, ordine: 0 });
    if (eFoto) return { error: eFoto.message };
  }

  revalidatePath("/immobili");
  revalidatePath("/");
  return { ok: true };
}

export async function aggiornaImmobile(
  _prevState: SaveState,
  formData: FormData
): Promise<SaveState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non autenticato." };

  const id = String(formData.get("id") || "");
  if (!id) return { error: "Immobile non trovato." };

  const titolo = String(formData.get("titolo") || "").trim();
  const zona = String(formData.get("zona") || "").trim();
  const prezzo = Number(formData.get("prezzo") || 0);
  if (!titolo || !zona || !prezzo) {
    return { error: "Titolo, zona e canone sono obbligatori." };
  }

  const descrizione = String(formData.get("descrizione") || "") || null;
  const locali = Number(formData.get("locali") || 0) || null;
  const mq = Number(formData.get("mq") || 0) || null;
  const attributi = parseAttributi(formData.get("attributi"));
  const pubblicato = formData.get("pubblicato") === "true";
  const fotoUrl = String(formData.get("fotoUrl") || "").trim();

  const { error } = await supabase
    .from("listings")
    .update({
      titolo,
      descrizione,
      zona,
      prezzo,
      locali,
      mq,
      attributi,
      pubblicato,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("owner_id", user.id);

  if (error) return { error: error.message };

  // Sostituiamo la foto principale (approccio semplice: cancella e reinserisci)
  const { error: eDel } = await supabase
    .from("listing_photos")
    .delete()
    .eq("listing_id", id);
  if (eDel) return { error: eDel.message };

  if (fotoUrl) {
    const { error: eFoto } = await supabase
      .from("listing_photos")
      .insert({ listing_id: id, url: fotoUrl, ordine: 0 });
    if (eFoto) return { error: eFoto.message };
  }

  revalidatePath("/immobili");
  revalidatePath("/");
  return { ok: true };
}

export async function eliminaImmobile(id: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Non autenticato." };

  // Non permettiamo di eliminare un immobile che ha già candidature:
  // cancellarlo cancellerebbe a cascata anche quelle (e gli eventuali
  // contratti collegati). Meglio nascondere l'annuncio in quel caso.
  const { count } = await supabase
    .from("candidature")
    .select("id", { count: "exact", head: true })
    .eq("listing_id", id);

  if (count && count > 0) {
    return {
      error:
        "Questo annuncio ha già delle candidature: non può essere eliminato, ma puoi nasconderlo (Non pubblicato).",
    };
  }

  const { error } = await supabase
    .from("listings")
    .delete()
    .eq("id", id)
    .eq("owner_id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/immobili");
  revalidatePath("/");
  return { ok: true };
}
MATCHAMI_FILE_EOF

cat > "src/app/(app)/immobili/page.tsx" << 'MATCHAMI_FILE_EOF'
import { createClient } from "@/lib/supabase/server";
import { ImmobiliClient } from "./ImmobiliClient";
import type { ImmobileDettaglio } from "@/lib/types";

export default async function ImmobiliPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: listings }, { data: candidature }] = await Promise.all([
    supabase
      .from("listings")
      .select(
        "id, titolo, descrizione, zona, prezzo, locali, mq, attributi, pubblicato, listing_photos(url)"
      )
      .eq("owner_id", user!.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("candidature")
      .select("id, listing_id, listings!inner(owner_id)")
      .eq("listings.owner_id", user!.id),
  ]);

  const nCandidaturePerListing = new Map<string, number>();
  for (const c of candidature ?? []) {
    const id = c.listing_id as string;
    nCandidaturePerListing.set(id, (nCandidaturePerListing.get(id) ?? 0) + 1);
  }

  const immobili: ImmobileDettaglio[] = (listings ?? []).map((l) => ({
    id: l.id,
    titolo: l.titolo,
    descrizione: l.descrizione,
    zona: l.zona,
    prezzo: l.prezzo,
    locali: l.locali,
    mq: l.mq,
    attributi: (l.attributi as Record<string, boolean>) ?? {},
    pubblicato: l.pubblicato,
    fotoUrl: (l.listing_photos as { url: string }[])?.[0]?.url ?? null,
    nCandidature: nCandidaturePerListing.get(l.id) ?? 0,
  }));

  return <ImmobiliClient immobili={immobili} />;
}
MATCHAMI_FILE_EOF

cat > "src/app/(app)/immobili/ImmobiliClient.tsx" << 'MATCHAMI_FILE_EOF'
"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { Sheet } from "@/components/Sheet";
import { ATTR_VOCAB, ZONE_MILANO } from "@/lib/constants";
import type { ImmobileDettaglio } from "@/lib/types";
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
    <div className="px-5 pt-6 pb-8 max-w-md mx-auto">
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
    </div>
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
rm -rf .next
npm run build
