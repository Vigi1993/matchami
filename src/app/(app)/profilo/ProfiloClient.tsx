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
