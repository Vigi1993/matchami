"use client";

import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { ATTR_VOCAB, RISCALDAMENTI, TIPI_CONTRATTO } from "@/lib/constants";
import { LuogoAutocomplete } from "@/components/LuogoAutocomplete";
import { updateRicerca, type SaveState } from "@/app/(app)/profilo/actions";
import { Chip } from "@/components/ui/Chip";
import { Field } from "@/components/ui/Field";
import { SaveButton } from "@/components/ui/SaveButton";
import { StepperOpzionale } from "@/components/ui/StepperOpzionale";
import type { Luogo } from "@/lib/luoghi";
import { etichettaCriterio } from "@/lib/match/criteri-ricerca";
import type { CriterioRicerca, ProfiloRicerca } from "@/lib/match/tipi";
import {
  BUDGET,
  LOCALI,
  METRATURA,
  OPZIONI_CLASSE,
  OPZIONI_PIANO,
  alternaTipo,
  aggiungi,
  disponibili,
  inElenco,
  modifica,
  primoErrore,
  ricercaPerSalvataggio,
  rimuovi,
  statoDaRicerca,
  testoBudget,
  type StatoRicerca,
} from "@/lib/ricerca-form";

const oggiIso = () => new Date().toISOString().slice(0, 10);

/** Necessaria (se la casa non ce l'ha sparisce) oppure opzionale (pesa sul punteggio, da 1 a 10). */
function Importanza({ nome, c, onChange }: { nome: string; c: CriterioRicerca; onChange: (cambio: Partial<CriterioRicerca>) => void }) {
  return (
    <div className="importanza">
      <div className="chip-row" role="group" aria-label={`Quanto conta: ${nome}`}>
        <Chip label="Opzionale" active={!c.necessaria} onClick={() => onChange({ necessaria: false })} />
        <Chip label="Necessaria" active={c.necessaria} onClick={() => onChange({ necessaria: true })} />
      </div>
      {c.necessaria ? (
        <p className="field-note" style={{ margin: "4px 0 0" }}>
          Se una casa non ce l&apos;ha, non la vedi.
        </p>
      ) : (
        <div style={{ marginTop: 6 }}>
          <div className="pref-label" style={{ marginBottom: 2 }}>
            <span>Importanza · {c.peso}/10</span>
          </div>
          <input type="range" min={1} max={10} value={c.peso} aria-label={`Importanza di ${nome}`} onChange={(e) => onChange({ peso: Number(e.target.value) })} className="w-full" />
        </div>
      )}
    </div>
  );
}

/** Il controllo del valore di una caratteristica: dipende da quale è. I sì/no non ne hanno. */
function ValoreCaratteristica({ c, oggi, onChange }: { c: CriterioRicerca; oggi: string; onChange: (valore: CriterioRicerca["valore"]) => void }) {
  const v = c.valore ?? {};
  const tre = new Date(`${oggi}T00:00:00Z`);
  tre.setUTCFullYear(tre.getUTCFullYear() + 3);
  switch (c.chiave) {
    case "bagni":
      return <StepperOpzionale etichetta="Bagni minimi" value={v.min ?? 1} onChange={(n) => onChange({ min: Math.max(1, n) })} min={1} max={6} />;
    case "piano": {
      const menu = (cosa: "min" | "max", nome: string) => (
        <label className="piano-menu">
          <span>{nome}</span>
          <select
            value={v[cosa] ?? ""}
            onChange={(e) => onChange({ min: v.min ?? null, max: v.max ?? null, [cosa]: e.target.value === "" ? null : Number(e.target.value) })}
          >
            <option value="">Qualsiasi</option>
            {OPZIONI_PIANO.map((o) => (
              <option key={o.valore} value={o.valore}>
                {o.etichetta}
              </option>
            ))}
          </select>
        </label>
      );
      return (
        <div className="piano-menu-riga">
          {menu("min", "Dal piano")}
          {menu("max", "Fino al piano")}
        </div>
      );
    }
    case "riscaldamento":
      return (
        <div className="chip-row" role="group" aria-label="Tipo di riscaldamento">
          {RISCALDAMENTI.map((r) => {
            const tipi = v.tipi ?? [];
            const attivo = tipi.includes(r.id);
            return (
              <Chip
                key={r.id}
                label={r.label}
                active={attivo}
                // l'ultimo tipo non si toglie: per non volerlo si toglie la caratteristica
                onClick={() => (attivo && tipi.length === 1 ? undefined : onChange({ tipi: attivo ? tipi.filter((t) => t !== r.id) : [...tipi, r.id] }))}
              />
            );
          })}
        </div>
      );
    case "ingresso":
      return (
        <label className="piano-menu">
          <span>Disponibile entro il</span>
          <input type="date" min={oggi} max={tre.toISOString().slice(0, 10)} value={v.entro ?? ""} onChange={(e) => e.target.value && onChange({ entro: e.target.value })} />
        </label>
      );
    case "classeEnergetica":
      return (
        <label className="piano-menu">
          <span>Almeno la classe</span>
          <select value={v.classe ?? "C"} onChange={(e) => onChange({ classe: e.target.value })}>
            {OPZIONI_CLASSE.map((o) => (
              <option key={o.classe} value={o.classe}>
                {o.etichetta}
              </option>
            ))}
          </select>
        </label>
      );
    default:
      return null;
  }
}

/**
 * La scheda «La tua ricerca»: cosa cerchi, dove, budget, locali, metratura, tipo di contratto e le caratteristiche (ognuna
 * necessaria o opzionale). Si apre dal Profilo e dalla Home. Salva TUTTO in una volta.
 */
export function RicercaSheet({
  open,
  onClose,
  ricerca,
  luoghi,
  onSalvata,
}: {
  open: boolean;
  onClose: () => void;
  ricerca: ProfiloRicerca;
  luoghi: Luogo[];
  /** chiamata quando il salvataggio è riuscito (la Home la usa per ricominciare il mazzo) */
  onSalvata?: () => void;
}) {
  const [state, formAction, pending] = useActionState<SaveState, FormData>(updateRicerca, null);

  // Un salvataggio è FINITO (da «in corso» a «non più in corso») ed è andato bene: lo si comunica una volta sola.
  // Non si confronta l'oggetto dello stato con quello di prima: due risposte possono essere lo stesso oggetto.
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

  const [s, setS] = useState<StatoRicerca>(() => statoDaRicerca(ricerca));
  const [oggi] = useState(oggiIso);
  const errore = useMemo(() => primoErrore(s), [s]);
  const cambia = (parziale: Partial<StatoRicerca>) => setS((prec) => ({ ...prec, ...parziale }));
  const contratto = s.criteri.find((c) => c.chiave === "contratto");
  const inLista = s.criteri.filter(inElenco);
  const daAggiungere = disponibili(s.criteri);
  const nomeCaratteristica = (c: CriterioRicerca) => ATTR_VOCAB.find((a) => a.key === c.chiave)?.label ?? etichettaCriterio(c);

  return (
    <Sheet open={open} onClose={onClose} title="La tua ricerca">
      <p className="sheet-sub">Le tue richieste possono cambiare nel tempo: aggiornale qui quando vuoi, il % di match si ricalcola subito.</p>
      <form action={formAction}>
        <input type="hidden" name="ricerca" value={JSON.stringify(ricercaPerSalvataggio(s))} />

        <Field label="Cosa cerchi">
          <div className="chip-row" role="group" aria-label="Cosa cerchi">
            <Chip label="Appartamento" active={s.tipologia === "appartamento"} onClick={() => cambia({ tipologia: "appartamento" })} />
            <Chip label="Villa" active={s.tipologia === "villa"} onClick={() => cambia({ tipologia: "villa" })} />
            <button type="button" className="chip" disabled aria-label="Posto letto, presto disponibile">
              Posto letto · presto
            </button>
          </div>
        </Field>

        <Field label="Dove">
          <LuogoAutocomplete luoghi={luoghi} scelti={s.luoghi} onChange={(ids) => cambia({ luoghi: ids })} />
          <p className="field-note" style={{ margin: "6px 0 0" }}>
            {s.luoghi.length === 0 ? "Senza luoghi cerchi ovunque." : "Scegliendo una città scegli tutti i suoi quartieri."}
          </p>
        </Field>

        <Field label={`Budget · ${testoBudget(s.budgetMin, s.budgetMax)}`}>
          <div className="pref-label" style={{ marginBottom: 2 }}>
            <span>Minimo</span>
          </div>
          <input
            type="range"
            min={BUDGET.min}
            max={BUDGET.max}
            step={BUDGET.step}
            value={s.budgetMin}
            aria-label="Budget minimo"
            onChange={(e) => {
              const v = Number(e.target.value);
              cambia({ budgetMin: v, budgetMax: Math.max(v, s.budgetMax) });
            }}
            className="w-full"
          />
          <div className="pref-label" style={{ margin: "8px 0 2px" }}>
            <span>Massimo</span>
          </div>
          <input
            type="range"
            min={BUDGET.min}
            max={BUDGET.max}
            step={BUDGET.step}
            value={s.budgetMax}
            aria-label="Budget massimo"
            onChange={(e) => {
              const v = Number(e.target.value);
              cambia({ budgetMax: v, budgetMin: Math.min(v, s.budgetMin) });
            }}
            className="w-full"
          />
        </Field>

        <Field label="Locali">
          <div className="da-a">
            <div>
              <span className="da-a-et">Da</span>
              <StepperOpzionale etichetta="Locali minimi" value={s.localiMin} onChange={(v) => cambia({ localiMin: v, localiMax: s.localiMax > 0 ? Math.max(v, s.localiMax) : 0 })} min={1} max={LOCALI.max} avvio={2} />
            </div>
            <div>
              <span className="da-a-et">A</span>
              <StepperOpzionale etichetta="Locali massimi" value={s.localiMax} onChange={(v) => cambia({ localiMax: v, localiMin: v > 0 && s.localiMin > 0 ? Math.min(v, s.localiMin) : s.localiMin })} min={1} max={LOCALI.max} avvio={Math.max(3, s.localiMin)} />
            </div>
          </div>
        </Field>

        <Field label="Metratura">
          <div className="da-a">
            <div>
              <span className="da-a-et">Da</span>
              <StepperOpzionale etichetta="Metratura minima" value={s.mqMin} onChange={(v) => cambia({ mqMin: v, mqMax: s.mqMax > 0 ? Math.max(v, s.mqMax) : 0 })} min={METRATURA.min} max={METRATURA.max} step={METRATURA.step} suffix=" m²" avvio={50} />
            </div>
            <div>
              <span className="da-a-et">A</span>
              <StepperOpzionale etichetta="Metratura massima" value={s.mqMax} onChange={(v) => cambia({ mqMax: v, mqMin: v > 0 && s.mqMin > 0 ? Math.min(v, s.mqMin) : s.mqMin })} min={METRATURA.min} max={METRATURA.max} step={METRATURA.step} suffix=" m²" avvio={Math.max(80, s.mqMin)} />
            </div>
          </div>
        </Field>

        <Field label="Tipo di contratto">
          <div className="chip-row" role="group" aria-label="Tipo di contratto">
            {TIPI_CONTRATTO.map((t) => (
              <Chip key={t.id} label={t.label} active={!!contratto?.valore?.tipi?.includes(t.id)} onClick={() => cambia({ criteri: alternaTipo(s.criteri, "contratto", t.id) })} />
            ))}
          </div>
          {contratto ? (
            <Importanza nome="il tipo di contratto" c={contratto} onChange={(cm) => cambia({ criteri: modifica(s.criteri, "contratto", cm) })} />
          ) : (
            <p className="field-note" style={{ margin: "6px 0 0" }}>
              Senza una scelta vanno bene tutti.
            </p>
          )}
        </Field>

        <Field label="Caratteristiche che ti interessano">
          {inLista.length > 0 && (
            <div className="flex flex-col gap-3" style={{ marginBottom: 12 }}>
              {inLista.map((c) => (
                <div key={c.chiave} className="carta-caratteristica">
                  <div className="carta-caratteristica-testa">
                    <b>{nomeCaratteristica(c)}</b>
                    <button type="button" className="redo-link" aria-label={`Togli ${nomeCaratteristica(c)}`} onClick={() => cambia({ criteri: rimuovi(s.criteri, c.chiave) })}>
                      Togli
                    </button>
                  </div>
                  <ValoreCaratteristica c={c} oggi={oggi} onChange={(valore) => cambia({ criteri: modifica(s.criteri, c.chiave, { valore }) })} />
                  <Importanza nome={nomeCaratteristica(c)} c={c} onChange={(cm) => cambia({ criteri: modifica(s.criteri, c.chiave, cm) })} />
                </div>
              ))}
            </div>
          )}
          {daAggiungere.length > 0 && (
            <>
              <div className="pref-label" style={{ marginBottom: 6 }}>
                <span>Aggiungi</span>
              </div>
              <div className="chip-row" role="group" aria-label="Caratteristiche da aggiungere">
                {daAggiungere.map((c) => (
                  <Chip key={c.chiave} label={`+ ${c.etichetta}`} active={false} onClick={() => cambia({ criteri: aggiungi(s.criteri, c.chiave, oggi) })} />
                ))}
              </div>
            </>
          )}
        </Field>

        {errore && (
          <p className="note-error" role="alert">
            {errore}
          </p>
        )}
        {state?.error && <p className="note-error">{state.error}</p>}
        {state?.ok && <p className="note-saved">Salvato — puoi chiudere.</p>}
        <SaveButton pending={pending} disabled={errore !== null} />
      </form>
    </Sheet>
  );
}
