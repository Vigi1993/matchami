"use client";

import { useActionState, useState } from "react";
import { decidiInquilino, type EsitoState } from "../../actions";
import { anteprimaCopertura, type DocumentoDaStimare } from "@/lib/verifica-importi";
import { etichettaPersona } from "@/lib/scadenze-verifiche";

/**
 * L'esito dello staff sul reddito: per ogni prova NUOVA si scrive quanto dimostra al mese (vuoto = la prova non vale e si scarta); si vede subito quanta parte
 * del reddito del nucleo dichiarato risulterà verificata. «Respingi» chiede un motivo e non vuole importi.
 */
export function EsitoInquilinoForm({
  id,
  documenti,
  redditiNucleo,
  redditoNucleo,
  redditoMensile,
}: {
  id: string;
  /** le prove del reddito NUOVE (non ancora verificate), con la persona a cui appartengono */
  documenti: DocumentoDaStimare[];
  redditiNucleo: number | null;
  redditoNucleo: number | null;
  redditoMensile: number | null;
}) {
  const [state, formAction, pending] = useActionState<EsitoState, FormData>(decidiInquilino, null);
  const [valori, setValori] = useState<Record<string, string>>({});
  const persone = Math.max(1, Math.min(6, redditiNucleo ?? 1));
  const anteprima = anteprimaCopertura({ documenti, valori, redditiNucleo, redditoNucleo, redditoMensile });

  return (
    <form action={formAction} className="staff-esito">
      <input type="hidden" name="id" value={id} />

      <div className="pref-label">
        <span>Quanto dimostra ogni prova del reddito (€ al mese, netto)</span>
      </div>
      {documenti.length === 0 ? (
        <p className="note-error">Non ci sono prove del reddito nuove da stimare: puoi solo respingere.</p>
      ) : (
        documenti.map((d) => (
          <div key={d.id} className="feat-row">
            <span className="k">
              {d.nome ?? "Documento"}
              {persone > 1 ? ` · ${etichettaPersona(d.persona)}` : ""}
            </span>
            <input
              name={`importo-${d.id}`}
              inputMode="numeric"
              className="ricerca-input"
              style={{ maxWidth: 140 }}
              placeholder="es. 1500"
              aria-label={`Importo mensile che dimostra ${d.nome ?? "il documento"}`}
              value={valori[d.id] ?? ""}
              onChange={(e) => setValori({ ...valori, [d.id]: e.target.value })}
            />
          </div>
        ))
      )}
      <p className="field-note">
        Lascia vuoto se la prova non vale: verrà scartata e cancellata. Per ogni persona del nucleo con un reddito ({persone}) serve almeno una prova; se una persona ne ha due, conta la più alta.
      </p>
      <p className="note-box" role="status" style={{ marginTop: 8 }}>
        <b>{anteprima.completa ? "Reddito del nucleo documentato" : "Reddito del nucleo documentato in parte"}</b>
        <br />
        {anteprima.testo}
      </p>

      <div className="pref-label" style={{ marginTop: 18 }}>
        <span>Se respingi, scrivi cosa non va</span>
      </div>
      <textarea name="nota" className="ob-textarea" placeholder="Es. La busta paga è illeggibile, caricane una più nitida" rows={3} />
      <p className="field-note">La persona leggerà questa nota. Serve solo per respingere.</p>

      {state?.error && <p className="note-error">{state.error}</p>}

      <div className="flex gap-3" style={{ marginTop: 14 }}>
        <button type="submit" name="esito" value="respingi" disabled={pending} className="btn-danger-outline">
          Respingi
        </button>
        <button type="submit" name="esito" value="verifica" disabled={pending || documenti.length === 0} className="opp-cta">
          Verifica il reddito
        </button>
      </div>
    </form>
  );
}
