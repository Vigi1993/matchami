"use client";

import { notaDomandaProtesti, rispostaBloccata } from "@/lib/protesti";
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
import { CampoImporto } from "@/components/CampoImporto";
import { NOTE_DOCUMENTI } from "@/lib/benvenuto-testi";

/**
 * Il modulo dei dati personali: lavoro, reddito, garante, protesti, nucleo e presentazione. Sta dentro la scheda
 * «I tuoi dati» (DatiSheet), che sulla Home e nel Profilo è la stessa. Alcune risposte valgono nel punteggio di
 * affidabilità: le note sotto ogni domanda lo dicono. Le domande che il punteggio usa hanno un'ancora (`dati-protesti`,
 * `dati-garante`) a cui il riepilogo in alto può far scorrere.
 */
export type SezioneDati = "tutto" | "persona" | "reddito" | "garanzie";

export function DatiForm({
  tenant,
  onSalvata,
  sezione = "tutto",
  etichettaSalva,
}: {
  tenant: TenantProfile;
  /** chiamata quando un salvataggio finisce bene (la Home la usa per chiudere la scheda e dirlo) */
  onSalvata?: () => void;
  /**
   * Quale parte del modulo mostrare. Il percorso di benvenuto lo usa una scheda alla volta: le domande non mostrate restano nel modulo come
   * campi nascosti con i loro valori di oggi, quindi salvare una scheda non cancella le altre. «tutto» è il modulo completo, com'è sempre stato.
   */
  sezione?: SezioneDati;
  /** il testo del pulsante di salvataggio (di partenza «Salva») */
  etichettaSalva?: string;
}) {
  const mostra = (s: Exclude<SezioneDati, "tutto">) => sezione === "tutto" || sezione === s;
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
  const statoProtesti = tenant.protesti_verifica_stato ?? "non_avviata";
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
      {sezione === "tutto" && (
        <p className="sheet-sub">
          Queste informazioni aiutano i proprietari a valutare la tua
          candidatura.
        </p>
      )}
      <form action={formAction}>
        {/* Schede del benvenuto prima di quella dei protesti: la risposta ancora non c'è e non è un errore. La scheda «persona» chiede il lavoro. */}
        {(sezione === "persona" || sezione === "reddito") && <input type="hidden" name="parziale" value="1" />}
        {sezione === "persona" && <input type="hidden" name="richiede_lavoro" value="1" />}
        {/* la presentazione è l'unica risposta che non sta in un campo nascosto: se non si mostra, si riscrive uguale per non cancellarla */}
        {!mostra("persona") && <input type="hidden" name="presentazione" value={presentazione} />}
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

        {mostra("persona") && (
        <Field label="La tua foto">
          <AvatarUpload value={avatarUrl} onChange={setAvatarUrl} />
        </Field>
        )}

        {mostra("persona") && (
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
        )}

        {mostra("reddito") && (
        <Field label={`Reddito netto mensile · €${reddito.toLocaleString("it-IT")}`}>
          <CampoImporto valore={reddito} onChange={setReddito} massimoBarra={8000} nome="Reddito netto mensile" />
          {tenant.verificato && (
            <p className="field-note">
              Il tuo reddito è verificato: se cambi lavoro o reddito (anche quello del nucleo) la verifica decade e va rifatta.
            </p>
          )}
        </Field>
        )}
        {sezione === "reddito" && <p className="nota-documenti" role="note">{NOTE_DOCUMENTI.reddito}</p>}

        {mostra("garanzie") && (
        <>
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
        </>
        )}

        {mostra("garanzie") && (
        <>
        <div id="dati-protesti" className="ancora-dati" />
        <Field label="Hai protesti o segnalazioni in centrale rischi? · obbligatorio">
          {rispostaBloccata(statoProtesti) ? (
            // verificato dallo staff: non si cambia da soli (il valore resta nel modulo, nascosto, e viene riscritto uguale)
            <p className="risposta-verificata" role="status">
              <b>{protestato ? "Sì, risultano protesti" : "No, nessun protesto"}</b> · verificato dallo staff
            </p>
          ) : (
            <div className="chip-row">
              <Chip label="No" active={protestato === false} onClick={() => setProtestato(false)} />
              <Chip label="Sì" active={protestato === true} onClick={() => setProtestato(true)} />
            </div>
          )}
          <p className="field-note">
            Va indicato. Rispondere «No» vale +{PUNTI_AFFIDABILITA.protesti} nel punteggio; «Sì», o non rispondere, toglie {PUNTI_AFFIDABILITA.protesti}. {notaDomandaProtesti(statoProtesti)}
          </p>
        </Field>
        </>
        )}
        {sezione === "garanzie" && <p className="nota-documenti" role="note">{NOTE_DOCUMENTI.protesti}</p>}

        {mostra("garanzie") && (
        <Field label="Disponibile a firmare una fideiussione?">
          <div className="chip-row">
            <Chip label="Sì" active={fideiussione === true} onClick={() => setFideiussione(true)} />
            <Chip label="No" active={fideiussione === false} onClick={() => setFideiussione(false)} />
          </div>
        </Field>
        )}

        {mostra("reddito") && (
        <Field label="Nucleo familiare">
          <div className="chip-row">
            <Chip label="Single" active={nucleo === "single"} onClick={() => setNucleo("single")} />
            <Chip label="Coppia" active={nucleo === "coppia"} onClick={() => setNucleo("coppia")} />
          </div>
        </Field>
        )}

        {mostra("reddito") && (
        <Field label="Figli a carico">
          <Stepper value={figli} onChange={setFigli} min={0} max={8} />
        </Field>
        )}

        {mostra("reddito") && (
        <Field label="Persone con reddito nel nucleo familiare">
          <Stepper value={redditiNucleo} onChange={setRedditiNucleo} min={1} max={6} />
        </Field>
        )}

        {mostra("reddito") && (
        <Field
          label={
            redditoNucleo > 0
              ? `Reddito netto mensile di tutto il nucleo · €${redditoNucleo.toLocaleString("it-IT")}`
              : "Reddito netto mensile di tutto il nucleo · non indicato"
          }
        >
          <CampoImporto valore={redditoNucleo} onChange={setRedditoNucleo} massimoBarra={15000} nome="Reddito netto mensile di tutto il nucleo" />
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
        )}

        {mostra("reddito") && (
        <Field label="Animali domestici?">
          <div className="chip-row">
            <Chip label="Sì" active={animali === true} onClick={() => setAnimali(true)} />
            <Chip label="No" active={animali === false} onClick={() => setAnimali(false)} />
          </div>
        </Field>
        )}

        {mostra("persona") && (
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
        )}

        {state?.error && <p className="note-error">{state.error}</p>}
        {state?.ok && sezione === "tutto" && <p className="note-saved">Salvato — puoi chiudere.</p>}
        <SaveButton pending={pending} etichetta={etichettaSalva} disabled={sezione === "persona" && professione === ""} />
        {sezione === "persona" && professione === "" && <p className="field-note">Scegli la tua situazione lavorativa per continuare.</p>}
      </form>
    </>
  );
}
