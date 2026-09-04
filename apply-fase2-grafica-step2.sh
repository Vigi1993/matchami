#!/usr/bin/env bash
set -e
echo "Applico Fase 2 grafica - step 2: griglie desktop sulle schermate con elenchi + Sheet centrato su desktop..."

mkdir -p "src/app/(app)"
mkdir -p "src/app/(app)/candidature"
mkdir -p "src/app/(app)/database"
mkdir -p "src/app/(app)/gestione"
mkdir -p "src/app/(app)/gestione-affitti"
mkdir -p "src/app/(app)/immobili"
mkdir -p "src/components"

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
      <div className="absolute bottom-0 left-0 right-0 max-h-[88vh] overflow-y-auto bg-paper rounded-t-3xl px-5 pt-5 pb-8 shadow-2xl md:bottom-auto md:left-1/2 md:right-auto md:top-1/2 md:w-full md:max-w-lg md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-3xl md:px-8 md:pt-6">
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
    <PageContainer wide>
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
      <div className="flex flex-col gap-3 md:grid md:grid-cols-2 md:gap-4 lg:grid-cols-3">
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
    <PageContainer wide>
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
        <div className="flex flex-col gap-3 md:grid md:grid-cols-2 md:gap-4 lg:grid-cols-3">
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
    <PageContainer wide>
      <h1 className="font-display text-xl text-ink mb-1">Gestione affitti</h1>
      <p className="text-xs text-ink/50 mb-6">
        Contratti dei tuoi immobili, dalla bozza alla firma.
      </p>

      {candidatureSenzaContratto.length > 0 && (
        <>
          <div className="mb-3 text-xs font-bold uppercase tracking-wide text-ink/50">
            Da avviare · {candidatureSenzaContratto.length}
          </div>
          <div className="flex flex-col gap-3 mb-6 md:grid md:grid-cols-2 md:gap-4 lg:grid-cols-3">
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
        <div className="flex flex-col gap-3 md:grid md:grid-cols-2 md:gap-4 lg:grid-cols-3">
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
    <PageContainer wide>
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
        <div className="flex flex-col gap-3 mb-6 md:grid md:grid-cols-2 md:gap-4 lg:grid-cols-3">
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
    <PageContainer wide>
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
      <div className="flex flex-col gap-3 md:grid md:grid-cols-2 md:gap-4 lg:grid-cols-3">
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

echo "Fatto. Ora lancio la build per verificare..."
rm -rf .next
npm run build
