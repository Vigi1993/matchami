"use client";

import { useActionState } from "react";
import { decidiInquilino, type EsitoState } from "../../actions";

export function EsitoInquilinoForm({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState<EsitoState, FormData>(decidiInquilino, null);

  return (
    <form action={formAction} className="staff-esito">
      <input type="hidden" name="id" value={id} />

      <div className="pref-label">
        <span>Se respingi, scrivi cosa non va</span>
      </div>
      <textarea
        name="nota"
        className="ob-textarea"
        placeholder="Es. La busta paga è illeggibile, caricane una più nitida"
        rows={3}
      />
      <p className="field-note">La persona leggerà questa nota. Serve solo per respingere.</p>

      {state?.error && <p className="note-error">{state.error}</p>}

      <div className="flex gap-3" style={{ marginTop: 14 }}>
        <button type="submit" name="esito" value="respingi" disabled={pending} className="btn-danger-outline">
          Respingi
        </button>
        <button type="submit" name="esito" value="verifica" disabled={pending} className="opp-cta">
          Verifica il reddito
        </button>
      </div>
    </form>
  );
}
