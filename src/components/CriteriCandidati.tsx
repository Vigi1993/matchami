"use client";

import { Chip } from "@/components/ui/Chip";
import { Stepper } from "@/components/ui/Stepper";
import {
  CATALOGO_CRITERI,
  CHIAVI_CRITERI,
  PESO_MAX,
  PESO_MIN,
  PESO_PREDEFINITO,
  SOGLIA_REDDITO_CANONE,
} from "@/lib/match";
import type { ChiaveCriterio, CriterioRichiesto } from "@/lib/match";

/**
 * Cosa chiede il proprietario ai candidati di un annuncio.
 *
 * Ogni criterio si attiva e, una volta attivo, ha un peso da 1 a 10 e un
 * modo: preferenziale (fa solo salire o scendere la percentuale) oppure
 * obbligatorio (se manca, il candidato finisce in fondo, segnalato).
 *
 * Il componente non salva niente: restituisce la lista al modulo che lo
 * contiene, che la invia insieme al resto dell'annuncio.
 */
export function CriteriCandidati({
  value,
  onChange,
}: {
  value: CriterioRichiesto[];
  onChange: (criteri: CriterioRichiesto[]) => void;
}) {
  function trova(chiave: ChiaveCriterio) {
    return value.find((c) => c.chiave === chiave);
  }

  function attiva(chiave: ChiaveCriterio) {
    const nuovo: CriterioRichiesto = {
      chiave,
      peso: PESO_PREDEFINITO,
      modo: "preferenziale",
      ...(chiave === "redditoCanone"
        ? { sogliaPct: SOGLIA_REDDITO_CANONE.predefinita }
        : {}),
    };
    onChange([...value, nuovo]);
  }

  function disattiva(chiave: ChiaveCriterio) {
    onChange(value.filter((c) => c.chiave !== chiave));
  }

  function cambia(chiave: ChiaveCriterio, modifiche: Partial<CriterioRichiesto>) {
    onChange(value.map((c) => (c.chiave === chiave ? { ...c, ...modifiche } : c)));
  }

  return (
    <div>
      <p className="field-note" style={{ margin: "-4px 0 12px 0" }}>
        Scegli cosa conta per te. Un criterio <b>preferenziale</b> fa salire o
        scendere la percentuale di compatibilità; uno <b>obbligatorio</b>, se
        manca, mette il candidato in fondo all&apos;elenco con un avviso. Gli
        inquilini non vedono i tuoi criteri.
      </p>

      <div className="criteri-lista">
        {CHIAVI_CRITERI.map((chiave) => {
          const def = CATALOGO_CRITERI[chiave];
          const attivo = trova(chiave);

          return (
            <div key={chiave} className={`criterio ${attivo ? "on" : ""}`}>
              <button
                type="button"
                className="criterio-testa"
                aria-pressed={!!attivo}
                onClick={() => (attivo ? disattiva(chiave) : attiva(chiave))}
              >
                <span className="criterio-check">{attivo ? "✓" : ""}</span>
                <span className="criterio-nome">
                  <b>{def.nome}</b>
                  <small>{def.descrizione}</small>
                </span>
              </button>

              {attivo && (
                <div className="criterio-opzioni">
                  <div className="chip-row">
                    <Chip
                      label="Preferenziale"
                      active={attivo.modo === "preferenziale"}
                      onClick={() => cambia(chiave, { modo: "preferenziale" })}
                    />
                    <Chip
                      label="Obbligatorio"
                      active={attivo.modo === "obbligatorio"}
                      onClick={() => cambia(chiave, { modo: "obbligatorio" })}
                    />
                  </div>

                  <div className="pref-label" style={{ margin: "14px 0 4px 0" }}>
                    <span>Importanza</span>
                    <b>
                      {attivo.peso}/{PESO_MAX}
                    </b>
                  </div>
                  <input
                    type="range"
                    min={PESO_MIN}
                    max={PESO_MAX}
                    step={1}
                    value={attivo.peso}
                    onChange={(e) => cambia(chiave, { peso: Number(e.target.value) })}
                    aria-label={`Importanza di ${def.nome}`}
                  />
                  {attivo.modo === "obbligatorio" && (
                    <p className="field-note">
                      L&apos;importanza conta comunque nella percentuale, anche
                      se il criterio è obbligatorio.
                    </p>
                  )}

                  {chiave === "redditoCanone" && (
                    <div style={{ marginTop: 14 }}>
                      <div className="pref-label" style={{ marginBottom: 8 }}>
                        <span>Il canone non supera</span>
                      </div>
                      <Stepper
                        value={attivo.sogliaPct ?? SOGLIA_REDDITO_CANONE.predefinita}
                        onChange={(v) => cambia(chiave, { sogliaPct: v })}
                        min={SOGLIA_REDDITO_CANONE.min}
                        max={SOGLIA_REDDITO_CANONE.max}
                        step={1}
                        suffix="%"
                      />
                      <p className="field-note">
                        del reddito mensile netto del nucleo, che il candidato
                        indica nel suo profilo.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {value.length === 0 && (
        <p className="field-note" style={{ marginTop: 10 }}>
          Senza criteri i candidati non hanno una percentuale e li vedi in
          ordine di arrivo.
        </p>
      )}
    </div>
  );
}
