"use client";

import { useState } from "react";
import { formattaIndirizzo } from "@/lib/mappe/indirizzo";
import type { IndirizzoConVista } from "@/lib/mappe/tipi";
import { MappaImmobile } from "@/components/MappaImmobile";

/**
 * L'indirizzo dell'immobile di un match, dentro la chat: lo vedono il
 * proprietario e la persona con cui ha un match accettato, nessun altro. Se
 * non è stato ancora indicato lo si dice, invece di non mostrare niente.
 */
export function IndirizzoChat({
  indirizzo,
  ruolo,
}: {
  indirizzo: IndirizzoConVista | null;
  ruolo: "inquilino" | "proprietario" | string;
}) {
  const [copiato, setCopiato] = useState(false);

  async function copia() {
    if (!indirizzo) return;
    try {
      await navigator.clipboard.writeText(formattaIndirizzo(indirizzo.indirizzo));
      setCopiato(true);
      setTimeout(() => setCopiato(false), 2000);
    } catch {
      // gli appunti non sono sempre disponibili: l'indirizzo resta leggibile a schermo
    }
  }

  const proprietario = ruolo === "proprietario";

  return (
    <details className="chat-visita chat-indirizzo">
      <summary>{indirizzo ? `Indirizzo: ${formattaIndirizzo(indirizzo.indirizzo)}` : "Indirizzo"}</summary>
      <div className="chat-visita-corpo">
        {indirizzo ? (
          <>
            <p>
              <b>{formattaIndirizzo(indirizzo.indirizzo)}</b>
            </p>
            {indirizzo.vista && <MappaImmobile vista={indirizzo.vista} />}
            {indirizzo.origine === "provvisoria" && (
              <p className="field-note" style={{ marginTop: 8 }}>
                La posizione sulla mappa è provvisoria: fa fede l&apos;indirizzo scritto.
              </p>
            )}
            <button type="button" className="redo-link" style={{ marginTop: 8 }} onClick={copia}>
              {copiato ? "Copiato" : "Copia l'indirizzo"}
            </button>
          </>
        ) : (
          <p className="field-note" style={{ marginTop: 0 }}>
            {proprietario
              ? "Non hai ancora indicato l'indirizzo dell'immobile: puoi farlo dalla scheda dell'immobile."
              : "Il proprietario non ha ancora indicato l'indirizzo. Puoi chiederglielo qui in chat."}
          </p>
        )}
      </div>
    </details>
  );
}
