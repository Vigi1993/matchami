"use client";

import { useActionState } from "react";
import { decidiRapporto, type EsitoState } from "../../actions";

export function EsitoRapportoForm({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState<EsitoState, FormData>(decidiRapporto, null);

  return (
    <form action={formAction} className="staff-esito">
      <input type="hidden" name="id" value={id} />

      <div className="pref-label">
        <span>Se respingi, scrivi cosa non va</span>
      </div>
      <textarea
        name="nota"
        className="ob-textarea"
        placeholder="Es. Il contratto non riporta il nome del proprietario"
        rows={3}
      />
      <p className="field-note">Entrambe le persone leggeranno questa nota. Serve solo per respingere.</p>

      {state?.error && <p className="note-error">{state.error}</p>}

      <div className="flex gap-3" style={{ marginTop: 14 }}>
        <button type="submit" name="esito" value="respingi" disabled={pending} className="btn-danger-outline">
          Respingi
        </button>
        <button type="submit" name="esito" value="verifica" disabled={pending} className="opp-cta">
          Verifica l&apos;affitto
        </button>
      </div>
    </form>
  );
}
