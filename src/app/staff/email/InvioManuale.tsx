"use client";

import { useActionState } from "react";
import { eseguiInvioManuale, type EsitoInvioManuale } from "./actions";

/** Il pulsante «Esegui l'invio adesso» e l'esito dell'ultimo giro. */
export function InvioManuale() {
  const [esito, azione, inCorso] = useActionState<EsitoInvioManuale, FormData>(async () => eseguiInvioManuale(), null);

  return (
    <form action={azione} style={{ margin: "12px 0 20px" }}>
      <button type="submit" className="opp-cta" disabled={inCorso}>
        {inCorso ? "Invio in corso..." : "Esegui l'invio adesso"}
      </button>
      {esito && "riepilogo" in esito && (
        <p className="field-note" style={{ marginTop: 8 }} role="status">
          {esito.riepilogo.fermato
            ? `Fermato: ${esito.riepilogo.fermato}`
            : `Persone: ${esito.riepilogo.utenti} · notifiche: ${esito.riepilogo.notifiche} · inviate: ${esito.riepilogo.inviate} · fallite: ${esito.riepilogo.fallite}`}
        </p>
      )}
    </form>
  );
}
