"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { LAVORO_VOCAB } from "@/lib/constants";
import { PUNTI_AFFIDABILITA } from "@/lib/affidabilita";
import type { TenantProfile } from "@/lib/types";
import { updateDatiPersonali, type SaveState } from "@/app/(app)/profilo/actions";
import { Chip } from "@/components/ui/Chip";
import { Field } from "@/components/ui/Field";
import { Stepper } from "@/components/ui/Stepper";
import { SaveButton } from "@/components/ui/SaveButton";
import { AvatarUpload } from "@/components/AvatarUpload";

/**
 * Il modulo dei dati personali: lavoro, reddito, garante, protesti, nucleo e presentazione. Sta dentro la scheda
 * «I tuoi dati» (DatiSheet), che sulla Home e nel Profilo è la stessa. Alcune risposte valgono nel punteggio di
 * affidabilità: le note sotto ogni domanda lo dicono. Le domande che il punteggio usa hanno un'ancora (`dati-protesti`,
 * `dati-garante`) a cui il riepilogo in alto può far scorrere.
 */
export function DatiForm({
  tenant,
  onSalvata,
}: {
  tenant: TenantProfile;
  /** chiamata quando un salvataggio finisce bene (la Home la usa per chiudere la scheda e dirlo) */
  onSalvata?: () => void;
}) {
  const [state, formAction, pending] = useActionState<SaveState, FormData>(
    updateDatiPersonali,
    null
  );

  // Un salvataggio è FINITO (da «in corso» a «non più in corso») ed è andato bene: lo si comunica una volta sola.
  const eraInCorso = useRef(false);
  useEffect(() => {
    if (pending) {
      eraInCorso.current = true;
      return;
    }
    if (eraInCorso.current) {
      eraInCorso.current = false;
      if (state?.ok) onSalvata?.();
    }
  }, [pending, state, onSalvata]);

  const [professione, setProfessione] = useState(tenant.professione ?? "");
  const [reddito, setReddito] = useState(tenant.reddito_mensile ?? 0);
  const [redditoNucleo, setRedditoNucleo] = useState(tenant.reddito_nucleo ?? 0);
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
    <>
      <p className="sheet-sub">
        Queste informazioni aiutano i proprietari a valutare la tua
        candidatura.
      </p>
      <form action={formAction}>
        <input type="hidden" name="professione" value={professione} />
        <input type="hidden" name="reddito_mensile" value={reddito} />
        <input type="hidden" name="reddito_nucleo" value={redditoNucleo} />
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
          {tenant.verificato && (
            <p className="field-note">
              Il tuo reddito è verificato: se cambi lavoro o reddito (anche quello del nucleo) la verifica decade e va rifatta.
            </p>
          )}
        </Field>

        <div id="dati-garante" className="ancora-dati" />
        <Field label="Hai un garante disponibile?">
          <div className="chip-row">
            <Chip label="Sì" active={garante === true} onClick={() => setGarante(true)} />
            <Chip label="No" active={garante === false} onClick={() => setGarante(false)} />
          </div>
          <p className="field-note">
            Garante o fideiussione valgono +{PUNTI_AFFIDABILITA.garanzia} nel punteggio (basta una delle due). Lo dichiari tu: nessuno lo controlla.
          </p>
        </Field>

        <div id="dati-protesti" className="ancora-dati" />
        <Field label="Hai protesti o segnalazioni in centrale rischi?">
          <div className="chip-row">
            <Chip label="No" active={protestato === false} onClick={() => setProtestato(false)} />
            <Chip label="Sì" active={protestato === true} onClick={() => setProtestato(true)} />
          </div>
          <p className="field-note">
            Rispondere «No» vale +{PUNTI_AFFIDABILITA.protesti} nel punteggio; se non rispondi vale come «Sì». Lo dichiari tu: nessuno lo controlla.
          </p>
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

        <Field
          label={
            redditoNucleo > 0
              ? `Reddito netto mensile di tutto il nucleo · €${redditoNucleo.toLocaleString("it-IT")}`
              : "Reddito netto mensile di tutto il nucleo · non indicato"
          }
        >
          <input
            type="range"
            min={0}
            max={15000}
            step={50}
            value={redditoNucleo}
            onChange={(e) => setRedditoNucleo(Number(e.target.value))}
            className="w-full"
          />
          <p className="field-note">
            La somma dei redditi di tutte le persone che vivono nella casa. I
            proprietari lo usano per capire quanto pesa l&apos;affitto sul
            vostro bilancio.
          </p>
          {reddito > 0 && redditoNucleo === 0 && (
            <button
              type="button"
              className="redo-link"
              style={{ marginTop: 8 }}
              onClick={() => setRedditoNucleo(reddito)}
            >
              Vivo da solo: uso €{reddito.toLocaleString("it-IT")}
            </button>
          )}
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
    </>
  );
}
