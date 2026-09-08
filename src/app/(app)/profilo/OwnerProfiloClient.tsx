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
import { AccountSheet } from "@/components/AccountSheet";
import {
  IconDomanda,
  IconLucchetto,
  IconPersona,
  IconScudo,
} from "@/components/icons";

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
  cognome,
  email,
  owner,
  consensoMarketingIniziale,
  consensoTerziIniziale,
}: {
  nome: string | null;
  cognome: string | null;
  email: string | null;
  owner: OwnerProfile;
  consensoMarketingIniziale: boolean;
  consensoTerziIniziale: boolean;
}) {
  const [datiAperto, setDatiAperto] = useState(false);
  const [accountAperto, setAccountAperto] = useState(false);
  const [privacyAperto, setPrivacyAperto] = useState(false);
  const [faqAperto, setFaqAperto] = useState(false);

  return (
    <PageContainer>
      {/* Avatar */}
      <div className="avatar-row">
        <div className="avatar">{(nome ?? "?").slice(0, 2).toUpperCase()}</div>
        <div>
          <div className="avatar-name">Il tuo profilo</div>
          <div className="avatar-sub">Proprietario a Milano</div>
        </div>
      </div>

      <div className="card-grid">
        <Row
          color="var(--ink)"
          icon={<IconPersona className="fill-none stroke-white stroke-2" />}
          title="I tuoi dati"
          subtitle="Tipo di proprietario, immobili gestiti e priorità."
          cta="Vedi il dettaglio"
          onClick={() => setDatiAperto(true)}
        />
        <Row
          color="var(--ink-soft)"
          icon={<IconLucchetto className="fill-none stroke-white stroke-2" />}
          title="Account e accesso"
          subtitle="Nome, email di accesso e password del tuo account MatchAmI."
          cta="Gestisci l'account"
          onClick={() => setAccountAperto(true)}
        />
        <Row
          color="var(--moss)"
          icon={<IconScudo className="fill-white stroke-none" />}
          title="Privacy e consensi"
          subtitle="Rivedi o modifica i consensi su marketing e condivisione dati con terzi."
          cta="Gestisci consensi"
          onClick={() => setPrivacyAperto(true)}
        />
        <Row
          color="var(--gold)"
          icon={<IconDomanda className="fill-none stroke-[var(--ink)] stroke-2" />}
          title="FAQ"
          subtitle="Domande frequenti su MatchAmI per i proprietari."
          cta="Vedi le domande frequenti"
          onClick={() => setFaqAperto(true)}
        />
      </div>

      <form action={logout} className="mt-6">
        <button className="redo-link" style={{ color: "var(--muted)" }}>
          Esci
        </button>
      </form>

      <Sheet
        open={datiAperto}
        onClose={() => setDatiAperto(false)}
        title="I tuoi dati"
      >
        <DatiProprietarioForm owner={owner} onSaved={() => setDatiAperto(false)} />
      </Sheet>

      <AccountSheet
        open={accountAperto}
        onClose={() => setAccountAperto(false)}
        nome={nome}
        cognome={cognome}
        email={email}
      />

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
    <form action={formAction}>
      <input type="hidden" name="proprietario_tipo" value={tipo} />
      <input type="hidden" name="num_immobili" value={numImmobili} />
      <input type="hidden" name="obiettivo" value={obiettivo} />

      <Field label="Tipo di proprietario">
        <div className="chip-row">
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
        <div className="stepper">
          <button
            type="button"
            onClick={() => setNumImmobili((n) => Math.max(1, n - 1))}
          >
            −
          </button>
          <div className="val">{numImmobili}</div>
          <button
            type="button"
            onClick={() => setNumImmobili((n) => Math.min(50, n + 1))}
          >
            +
          </button>
        </div>
      </Field>

      <Field label="Priorità">
        <div className="chip-row" style={{ flexDirection: "column", alignItems: "flex-start" }}>
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

      {state?.error && <p className="note-error">{state.error}</p>}
      {state?.ok && <p className="note-saved">Salvato.</p>}

      <button
        type="submit"
        disabled={pending}
        className="opp-cta"
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
