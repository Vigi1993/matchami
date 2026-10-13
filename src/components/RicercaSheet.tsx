"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { ATTR_VOCAB, ZONE_MILANO } from "@/lib/constants";
import type { TenantProfile } from "@/lib/types";
import { updateRicerca, type SaveState } from "@/app/(app)/profilo/actions";
import { Chip } from "@/components/ui/Chip";
import { Field } from "@/components/ui/Field";
import { Stepper } from "@/components/ui/Stepper";
import { SaveButton } from "@/components/ui/SaveButton";

/**
 * La scheda «La tua ricerca»: budget, zone, taglio e caratteristiche. Si apre dal Profilo e dalla Home.
 */
export function RicercaSheet({
  open,
  onClose,
  tenant,
  zoneIniziali,
  interessiIniziali,
  onSalvata,
}: {
  open: boolean;
  onClose: () => void;
  tenant: Pick<TenantProfile, "budget_max" | "locali_min" | "mq_min">;
  zoneIniziali: string[];
  interessiIniziali: Record<string, number>;
  /** chiamata quando il salvataggio è riuscito (la Home la usa per ricominciare il mazzo) */
  onSalvata?: () => void;
}) {
  const [state, formAction, pending] = useActionState<SaveState, FormData>(
    updateRicerca,
    null
  );

  // Un salvataggio è FINITO (da «in corso» a «non più in corso") ed è andato bene: lo si comunica una volta sola.
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
