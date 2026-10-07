"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  contaNonLette,
  descriviNotifica,
  linkNotifica,
  trascorso,
  type Notifica,
} from "@/lib/notifiche";

/**
 * L'elenco delle novità. Le notifiche le crea il database; qui si leggono,
 * si segnano come lette e si segue il link.
 */
export function NotificheLista({ notifiche }: { notifiche: Notifica[] }) {
  const router = useRouter();
  const [elenco, setElenco] = useState(notifiche);
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);

  const nonLette = contaNonLette(elenco);

  function segnaLocalmente(ids: string[] | null) {
    const adesso = new Date().toISOString();
    setElenco((prec) =>
      prec.map((n) => (!n.letta_at && (ids === null || ids.includes(n.id)) ? { ...n, letta_at: adesso } : n))
    );
  }

  async function apri(n: Notifica) {
    setErrore(null);
    if (!n.letta_at) {
      // Se segnare come letta non riesce, si va comunque dove porta: la
      // novità è più importante del suo stato.
      await createClient().rpc("segna_notifiche_lette", { p_ids: [n.id] });
      segnaLocalmente([n.id]);
      // il numero sulla barra lo calcola il server: va ricaricato
      router.refresh();
    }
    router.push(linkNotifica(n));
  }

  async function segnaTutte() {
    setErrore(null);
    setInCorso(true);
    try {
      const { error } = await createClient().rpc("segna_notifiche_lette", { p_ids: null });
      if (error) {
        setErrore("Non è stato possibile aggiornare le novità. Riprova.");
        return;
      }
      segnaLocalmente(null);
      router.refresh();
    } finally {
      setInCorso(false);
    }
  }

  return (
    <div>
      {nonLette > 0 && (
        <button type="button" className="redo-link" disabled={inCorso} onClick={segnaTutte} style={{ marginBottom: 12 }}>
          {inCorso ? "Aggiorno..." : "Segna tutte come lette"}
        </button>
      )}

      {errore && <p className="note-error">{errore}</p>}

      {elenco.length === 0 ? (
        <div className="note-box" style={{ marginTop: 0 }}>
          <b>Nessuna novità.</b> Qui trovi gli esiti delle verifiche, le risposte alle candidature e
          gli altri avvisi sul tuo account.
        </div>
      ) : (
        <ul className="notifiche-lista">
          {elenco.map((n) => {
            const d = descriviNotifica(n.tipo, n.dati);
            const nuova = !n.letta_at;
            return (
              <li key={n.id}>
                <button
                  type="button"
                  className={`notifica ${nuova ? "nuova" : ""}`}
                  onClick={() => apri(n)}
                >
                  {nuova && <span className="pallino" aria-hidden />}
                  <span className="notifica-corpo">
                    <span className="notifica-titolo">
                      {nuova && <span className="sr-only">Nuova. </span>}
                      {d.titolo}
                    </span>
                    <span className="notifica-testo">{d.testo}</span>
                    <span className="notifica-tempo">{trascorso(n.created_at)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
