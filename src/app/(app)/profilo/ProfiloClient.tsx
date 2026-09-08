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
import { AvatarUpload } from "@/components/AvatarUpload";
import { AccountSheet } from "@/components/AccountSheet";
import {
  IconDomanda,
  IconLente,
  IconLucchetto,
  IconPersona,
  IconScudo,
  IconStella,
} from "@/components/icons";

type Props = {
  nome: string | null;
  cognome: string | null;
  email: string | null;
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
  cognome,
  email,
  tenant,
  zoneIniziali,
  interessiIniziali,
  mediaRecensioni,
  numeroRecensioni,
  consensoMarketingIniziale,
  consensoTerziIniziale,
}: Props) {
  const [sheetAperta, setSheetAperta] = useState<
    "affidabilita" | "dati" | "ricerca" | "account" | "privacy" | "faq" | null
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
      <div className="avatar-row">
        <div className="avatar">
          {tenant.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={tenant.avatar_url} alt="" />
          ) : (
            (nome ?? "?").slice(0, 2).toUpperCase()
          )}
        </div>
        <div>
          <div className="avatar-name">Il tuo profilo</div>
          <div className="avatar-sub">In cerca a Milano</div>
        </div>
      </div>

      {/* Affidabilità */}
      <Row
        color="var(--gold)"
        icon={<IconStella className="fill-white stroke-none" />}
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
      <div className="completeness-row">
        <div className="completeness-bar">
          <div
            className="completeness-fill"
            style={{ width: `${completezza}%` }}
          />
        </div>
        <span>{completezza}% completo</span>
      </div>

      <div className="card-grid">
        {/* I tuoi dati */}
        <Row
          color="var(--ink)"
          icon={<IconPersona className="fill-none stroke-white stroke-2" />}
          title="I tuoi dati"
          subtitle="Lavoro, reddito, garante, protesti e presentazione: quello che vedono i proprietari."
          cta="Vedi il dettaglio"
          onClick={() => setSheetAperta("dati")}
        />

        {/* La tua ricerca */}
        <Row
          color="var(--clay)"
          icon={<IconLente className="fill-none stroke-white stroke-2" />}
          title="La tua ricerca"
          subtitle="Budget, zone, taglio e caratteristiche della casa che stai cercando."
          cta="Vedi il dettaglio"
          onClick={() => setSheetAperta("ricerca")}
        />

        {/* Account */}
        <Row
          color="var(--ink-soft)"
          icon={<IconLucchetto className="fill-none stroke-white stroke-2" />}
          title="Account e accesso"
          subtitle="Nome, email di accesso e password del tuo account MatchAmI."
          cta="Gestisci l'account"
          onClick={() => setSheetAperta("account")}
        />

        {/* Privacy / FAQ */}
        <Row
          color="var(--moss)"
          icon={<IconScudo className="fill-white stroke-none" />}
          title="Privacy e consensi"
          subtitle="Rivedi o modifica i consensi su marketing e condivisione dati con terzi."
          cta="Gestisci consensi"
          onClick={() => setSheetAperta("privacy")}
        />
        <Row
          color="var(--gold)"
          icon={<IconDomanda className="fill-none stroke-[var(--ink)] stroke-2" />}
          title="FAQ e bonus affitto"
          subtitle="Bonus giovani, contributo Comune di Milano, detrazioni 730 e altre curiosità."
          cta="Vedi le domande frequenti"
          onClick={() => setSheetAperta("faq")}
        />
      </div>

      <form action={logout} className="mt-6">
        <button className="redo-link" style={{ color: "var(--muted)" }}>
          Esci
        </button>
      </form>

      {/* ---- Sheet: Affidabilità (sola lettura) ---- */}
      <Sheet
        open={sheetAperta === "affidabilita"}
        onClose={() => setSheetAperta(null)}
        title="Il tuo voto di affidabilità"
      >
        <p className="sheet-sub">
          Nasce dallo storico dei tuoi affitti su MatchAmI e dalle verifiche
          sul tuo stato economico. I proprietari lo vedono quando valutano una
          tua candidatura.
        </p>
        <div className="stat-grid" style={{ gridTemplateColumns: "1fr" }}>
          <div className="stat-card">
            <div className="v">{affidabilita.punteggio}/100</div>
            <div className="l">{affidabilita.label}</div>
          </div>
        </div>
        <div className="pref-label">
          <span>Verifiche sullo stato economico</span>
        </div>
        <div className="match-checklist">
          {affidabilita.checks.map((c) => (
            <span key={c.label} className={c.ok ? "ok" : "no"}>
              {c.label}
            </span>
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

      {/* ---- Sheet: Account ---- */}
      <AccountSheet
        open={sheetAperta === "account"}
        onClose={() => setSheetAperta(null)}
        nome={nome}
        cognome={cognome}
        email={email}
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
  icon,
}: {
  color: string;
  title: string;
  subtitle: string;
  cta: string;
  onClick: () => void;
  icon?: React.ReactNode;
}) {
  return (
    <button onClick={onClick} className="pv-row">
      <div
        className="pv-check"
        style={{ background: color, borderColor: color }}
      >
        {icon}
      </div>
      <div className="pv-text">
        <div className="pv-label-row">
          <b>{title}</b>
        </div>
        <p>{subtitle}</p>
        <span className="pv-readmore">{cta}</span>
      </div>
    </button>
  );
}

function SaveButton({ pending }: { pending: boolean }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="opp-cta"
      style={{ marginTop: 6 }}
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
  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    tenant.avatar_url
  );

  return (
    <Sheet open={open} onClose={onClose} title="I tuoi dati">
      <p className="sheet-sub">
        Queste informazioni aiutano i proprietari a valutare la tua
        candidatura.
      </p>
      <form action={formAction}>
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
        <input type="hidden" name="avatar_url" value={avatarUrl ?? ""} />

        <Field label="La tua foto">
          <AvatarUpload value={avatarUrl} onChange={setAvatarUrl} />
        </Field>

        <Field label="Situazione lavorativa">
          <div className="chip-row">
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
          <div className="chip-row">
            <Chip label="Sì" active={garante === true} onClick={() => setGarante(true)} />
            <Chip label="No" active={garante === false} onClick={() => setGarante(false)} />
          </div>
        </Field>

        <Field label="Hai protesti o segnalazioni in centrale rischi?">
          <div className="chip-row">
            <Chip label="No" active={protestato === false} onClick={() => setProtestato(false)} />
            <Chip label="Sì" active={protestato === true} onClick={() => setProtestato(true)} />
          </div>
        </Field>

        <Field label="Disponibile a firmare una fideiussione?">
          <div className="chip-row">
            <Chip label="Sì" active={fideiussione === true} onClick={() => setFideiussione(true)} />
            <Chip label="No" active={fideiussione === false} onClick={() => setFideiussione(false)} />
          </div>
        </Field>

        <Field label="Nucleo familiare">
          <div className="chip-row">
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
          <div className="chip-row">
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
            className="ob-textarea"
          />
        </Field>

        {state?.error && <p className="note-error">{state.error}</p>}
        {state?.ok && <p className="note-saved">Salvato — puoi chiudere.</p>}
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
      <p className="sheet-sub">
        Le tue richieste possono cambiare nel tempo: aggiornale qui quando
        vuoi, il % di match si ricalcola subito.
      </p>
      <form action={formAction}>
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
          <div className="chip-row">
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
          <div className="chip-row" style={{ marginBottom: 14 }}>
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
                  <div className="pref-label" style={{ marginBottom: 4 }}>
                    <span>
                      {attr.label} · {peso}/10
                    </span>
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

        {state?.error && <p className="note-error">{state.error}</p>}
        {state?.ok && <p className="note-saved">Salvato — puoi chiudere.</p>}
        <SaveButton pending={pending} />
      </form>
    </Sheet>
  );
}
