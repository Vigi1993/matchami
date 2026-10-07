"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { testoConfermaRitiro } from "@/lib/candidature";
import { messaggioErroreVerifica } from "@/lib/verifica";

/**
 * Il ritiro di una candidatura in attesa, in due tempi: prima un avviso che
 * dice cosa comporta (il proprietario non la vede più, e non ci si può
 * ricandidare allo stesso annuncio), poi la conferma.
 *
 * Le regole vere (solo la propria, solo se in attesa) stanno nella funzione
 * `ritira_candidatura` del database.
 */
export function RitiraCandidatura({
  candidaturaId,
  titolo,
  onFatto,
}: {
  candidaturaId: string;
  titolo: string | null;
  onFatto: () => void;
}) {
  const [confermando, setConfermando] = useState(false);
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  async function ritira() {
    setErrore(null);
    setInCorso(true);
    try {
      const { error } = await createClient().rpc("ritira_candidatura", {
        p_candidatura: candidaturaId,
      });
      if (error) {
        setErrore(messaggioErroreVerifica(error.message));
        return;
      }
      onFatto();
    } finally {
      setInCorso(false);
    }
  }

  if (!confermando) {
    return (
      <button
        type="button"
        className="btn-danger-outline"
        style={{ marginTop: 16 }}
        onClick={() => {
          setErrore(null);
          setConfermando(true);
        }}
      >
        Ritira la candidatura
      </button>
    );
  }

  return (
    <div className="note-box is-no" style={{ marginTop: 16 }} role="alertdialog" aria-label="Conferma il ritiro">
      <p style={{ margin: "0 0 10px 0" }}>{testoConfermaRitiro(titolo)}</p>
      {errore && <p className="note-error">{errore}</p>}
      <div className="flex gap-3">
        <button
          type="button"
          className="btn-danger-outline"
          style={{ borderColor: "rgba(16,21,26,.14)", color: "var(--ink)" }}
          disabled={inCorso}
          onClick={() => setConfermando(false)}
        >
          Annulla
        </button>
        <button type="button" className="opp-cta" disabled={inCorso} onClick={ritira}>
          {inCorso ? "Ritiro..." : "Sì, ritira la candidatura"}
        </button>
      </div>
    </div>
  );
}
