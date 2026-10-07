"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { TAG_RECENSIONE } from "@/lib/constants";
import { messaggioErroreVerifica } from "@/lib/verifica";

/**
 * Il feedback di un proprietario su un inquilino, da un affitto verificato.
 *
 * La regola (proprietario verificato, affitto verificato, una recensione
 * per affitto, tag dalla lista) sta nella funzione `lascia_recensione` del
 * database. Qui si raccoglie solo il voto e le qualità.
 */
export function FormFeedback({
  rapportoId,
  nome,
  onFatto,
  onAnnulla,
}: {
  rapportoId: string;
  /** il nome dell'inquilino, per riconoscere di chi si parla */
  nome: string | null;
  onFatto: () => void;
  onAnnulla: () => void;
}) {
  const [voto, setVoto] = useState(0);
  const [tag, setTag] = useState<string[]>([]);
  const [errore, setErrore] = useState<string | null>(null);
  const [occupato, setOccupato] = useState(false);

  function alterna(t: string) {
    setTag((prec) => (prec.includes(t) ? prec.filter((x) => x !== t) : [...prec, t]));
  }

  async function invia() {
    if (voto < 1) {
      setErrore("Scegli un voto da 1 a 5.");
      return;
    }
    setErrore(null);
    setOccupato(true);
    try {
      const { error } = await createClient().rpc("lascia_recensione", {
        p_rapporto: rapportoId,
        p_voto: voto,
        p_tag: tag,
      });
      if (error) {
        setErrore(messaggioErroreVerifica(error.message));
        return;
      }
      onFatto();
    } finally {
      setOccupato(false);
    }
  }

  return (
    <div className="passo-verifica" style={{ marginTop: 10 }}>
      <div className="pref-label">
        <span>Feedback su {nome ?? "questa persona"}</span>
      </div>

      <div className="pref-label" style={{ margin: "10px 0 6px 0" }}>
        <span>Il tuo voto</span>
      </div>
      <div className="chip-row" role="group" aria-label="Il tuo voto">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={voto === n}
            className={`chip ${voto === n ? "on" : ""}`}
            onClick={() => setVoto(n)}
          >
            {n}
          </button>
        ))}
      </div>
      <p className="field-note">1 è pessimo, 5 è ottimo.</p>

      <div className="pref-label" style={{ margin: "12px 0 6px 0" }}>
        <span>Cosa riconosci a {nome ?? "questa persona"}</span>
      </div>
      <div className="chip-row">
        {TAG_RECENSIONE.map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={tag.includes(t)}
            className={`chip ${tag.includes(t) ? "on" : ""}`}
            onClick={() => alterna(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <p className="field-note">Facoltativo, scegline quante vuoi.</p>

      <p className="field-note" style={{ marginTop: 10, lineHeight: 1.6 }}>
        Il voto entra nel punteggio di affidabilità, che i proprietari vedono
        quando valutano una candidatura. Le qualità per ora non sono visibili
        ad altri. Dopo l&apos;invio il feedback non si può modificare.
      </p>

      {errore && (
        <p className="note-error" style={{ marginTop: 8 }}>
          {errore}
        </p>
      )}

      <div className="flex gap-3" style={{ marginTop: 12 }}>
        <button
          type="button"
          className="btn-danger-outline"
          style={{ borderColor: "rgba(16,21,26,.14)", color: "var(--ink)" }}
          disabled={occupato}
          onClick={onAnnulla}
        >
          Annulla
        </button>
        <button type="button" className="opp-cta" disabled={occupato} onClick={invia}>
          {occupato ? "Invio..." : "Invia il feedback"}
        </button>
      </div>
    </div>
  );
}
