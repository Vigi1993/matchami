"use client";

import { useState, useTransition } from "react";
import { confermaAffitto } from "@/app/(app)/gestione/affitto-actions";
import { TESTI_CONFERMA_AFFITTO } from "@/lib/affitto-contratto";
import { testoPrezzo } from "@/lib/proprietario/home";
import type { ContrattoConAnnuncio } from "@/lib/types";

/**
 * Quando il proprietario segna il contratto «firmato», l'inquilino conferma con un tocco che l'affitto è davvero cominciato, oppure
 * dice che c'è qualcosa che non va. Confermando nasce l'affitto, che lo staff verificherà.
 */
export function ConfermaAffitto({ contratto }: { contratto: ContrattoConAnnuncio }) {
  const [pending, startTransition] = useTransition();
  const [errore, setErrore] = useState<string | null>(null);
  const [esito, setEsito] = useState<"si" | "no" | null>(null);
  const casa = contratto.candidature?.listings;
  const dettagli = [casa?.titolo, contratto.canone ? testoPrezzo(contratto.canone) : null].filter(Boolean).join(" · ");

  function rispondi(conferma: boolean) {
    setErrore(null);
    startTransition(async () => {
      const r = await confermaAffitto(contratto.id, conferma);
      if (!r.ok) return setErrore(r.error);
      setEsito(conferma ? "si" : "no");
    });
  }

  if (esito) {
    return (
      <div className="conferma-affitto fatto" role="status">
        {esito === "si" ? TESTI_CONFERMA_AFFITTO.grazie : TESTI_CONFERMA_AFFITTO.rifiutato}
      </div>
    );
  }

  return (
    <div className="conferma-affitto" role="group" aria-label={TESTI_CONFERMA_AFFITTO.titolo}>
      <h3>{TESTI_CONFERMA_AFFITTO.titolo}</h3>
      {dettagli && <p className="conferma-affitto-casa">{dettagli}</p>}
      <p>{TESTI_CONFERMA_AFFITTO.spiegazione}</p>
      {errore && (
        <p className="note-error" role="alert">
          {errore}
        </p>
      )}
      <div className="conferma-affitto-azioni">
        <button type="button" className="opp-cta" disabled={pending} onClick={() => rispondi(true)}>
          {pending ? "Un momento..." : TESTI_CONFERMA_AFFITTO.si}
        </button>
        <button type="button" className="richieste-secondario" disabled={pending} onClick={() => rispondi(false)}>
          {TESTI_CONFERMA_AFFITTO.no}
        </button>
      </div>
    </div>
  );
}
