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
