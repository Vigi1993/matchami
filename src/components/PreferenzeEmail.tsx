"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { messaggioErroreVerifica } from "@/lib/verifica";

/**
 * L'interruttore delle email per le novità. Le novità restano sempre nell'app;
 * questo decide solo se arrivano anche per email (un riepilogo, al massimo una volta
 * all'ora, e solo per ciò che non hai già letto).
 */
export function PreferenzeEmail({ attive }: { attive: boolean }) {
  const router = useRouter();
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  async function cambia() {
    setErrore(null);
    setInCorso(true);
    try {
      const { error } = await createClient().rpc("imposta_email_notifiche", { p_attive: !attive });
      if (error) {
        setErrore(messaggioErroreVerifica(error.message));
        return;
      }
      router.refresh();
    } finally {
      setInCorso(false);
    }
  }

  return (
    <div className="preferenze-email">
      <div>
        <b>Email: {attive ? "attive" : "disattivate"}</b>
        <p className="field-note" style={{ margin: "2px 0 0 0" }}>
          {attive
            ? "Ricevi un riepilogo per email delle novità che non hai ancora letto, al massimo una volta all'ora."
            : "Le novità restano qui nell'app. Non ricevi email."}
        </p>
        {errore && (
          <p className="note-error" style={{ marginTop: 6 }} role="alert">
            {errore}
          </p>
        )}
      </div>
      <button type="button" className="redo-link" aria-pressed={attive} disabled={inCorso} onClick={cambia}>
        {inCorso ? "Un attimo..." : attive ? "Disattiva" : "Attiva"}
      </button>
    </div>
  );
}
