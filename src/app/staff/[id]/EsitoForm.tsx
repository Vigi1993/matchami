"use client";

import { useActionState } from "react";
import { decidiVerifica, type EsitoState } from "../actions";

export function EsitoForm({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState<EsitoState, FormData>(
    decidiVerifica,
    null
  );

  return (
    <form action={formAction} className="staff-esito">
      <input type="hidden" name="id" value={id} />

      <div className="pref-label">
        <span>Se respingi, scrivi cosa non va</span>
      </div>
      <textarea
        name="nota"
        className="ob-textarea"
        placeholder="Es. La visura non riporta il tuo nome: carica quella aggiornata"
        rows={3}
      />
      <p className="field-note">
        Il proprietario leggerà questa nota. Serve solo per respingere.
      </p>

      {state?.error && <p className="note-error">{state.error}</p>}

      <div className="flex gap-3" style={{ marginTop: 14 }}>
        <button
          type="submit"
          name="esito"
          value="respingi"
          disabled={pending}
          className="btn-danger-outline"
        >
          Respingi
        </button>
        <button
          type="submit"
          name="esito"
          value="verifica"
          disabled={pending}
          className="opp-cta"
        >
          Verifica l&apos;immobile
        </button>
      </div>
    </form>
  );
}
