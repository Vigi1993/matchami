"use client";

import { useActionState } from "react";
import { decidiProtesti, type EsitoState } from "../../actions";

/**
 * Le tre scelte dello staff sui protesti: «Nessun protesto», «Ci sono protesti» oppure «Respingi» (documento illeggibile, nome diverso...), che vuole una nota
 * che la persona leggerà. Il risultato dello staff PREVALE su ciò che la persona aveva dichiarato.
 */
export function EsitoProtestiForm({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState<EsitoState, FormData>(decidiProtesti, null);

  return (
    <form action={formAction} className="staff-esito">
      <input type="hidden" name="id" value={id} />

      <div className="pref-label">
        <span>Cosa risulta dal certificato</span>
      </div>
      <div className="flex gap-3" style={{ marginTop: 6 }}>
        <button type="submit" name="esito" value="nessun_protesto" disabled={pending} className="opp-cta">
          Nessun protesto
        </button>
        <button type="submit" name="esito" value="protestato" disabled={pending} className="btn-danger-outline">
          Ci sono protesti
        </button>
      </div>
      <p className="field-note">Il risultato vale più di ciò che la persona ha dichiarato e non lo potrà più cambiare da sola.</p>

      <div className="pref-label" style={{ marginTop: 22 }}>
        <span>Se il documento non va, scrivi cosa non va</span>
      </div>
      <textarea name="nota" className="ob-textarea" placeholder="Es. Il certificato è illeggibile o è intestato a un'altra persona: caricane uno nuovo" rows={3} />
      <p className="field-note">La persona leggerà questa nota. Serve solo per respingere.</p>

      {state?.error && <p className="note-error">{state.error}</p>}

      <div style={{ marginTop: 14 }}>
        <button type="submit" name="esito" value="respingi" disabled={pending} className="btn-danger-outline">
          Respingi
        </button>
      </div>
    </form>
  );
}
