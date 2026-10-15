"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { rispondiRichiesta, impostaVisibilita } from "@/app/(app)/candidature/richieste-actions";
import { fraseRichiesta, richiesteInAttesa, type RichiestaPerInquilino } from "@/lib/richieste";
import { IconMatch } from "@/components/icons";

type Esito = { stato: "accettata"; candidaturaId: string | null } | { stato: "rifiutata" };

/**
 * La scheda «Richieste dei proprietari» di «I tuoi match»: di partenza si è visibili ai proprietari (chi si è nascosto lo vede e può
 * tornare visibile), poi le richieste a cui rispondere. Accettare crea un match con la chat; rifiutare chiude la richiesta.
 */
export function RichiesteProprietari({ richieste, visibile }: { richieste: RichiestaPerInquilino[]; visibile: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [vis, setVis] = useState(visibile);
  const [esiti, setEsiti] = useState<Record<string, Esito>>({});
  const [errore, setErrore] = useState<string | null>(null);

  const inAttesa = richiesteInAttesa(richieste);

  function cambiaVisibilita(nuova: boolean) {
    setErrore(null);
    startTransition(async () => {
      const r = await impostaVisibilita(nuova);
      if (!r.ok) return setErrore(r.error);
      setVis(nuova);
      router.refresh();
    });
  }

  function rispondi(id: string, accetta: boolean) {
    setErrore(null);
    startTransition(async () => {
      const r = await rispondiRichiesta(id, accetta);
      if (!r.ok) return setErrore(r.error);
      setEsiti((e) => ({ ...e, [id]: accetta ? { stato: "accettata", candidaturaId: r.candidaturaId } : { stato: "rifiutata" } }));
      router.refresh();
    });
  }

  return (
    <div className="richieste">
      {/* ---- la visibilità: di partenza si è visibili; qui si dice com'è, e chi si è nascosto può tornare visibile ---- */}
      {vis ? (
        <p className="richieste-nota">
          I proprietari con una casa adatta alla tua ricerca possono vedere il tuo profilo (nome e iniziale del cognome, lavoro, foto, affidabilità e
          recensioni, non il reddito né i contatti) e scriverti. Tu decidi se rispondere. Per non farti trovare: Profilo › Privacy e consensi.
        </p>
      ) : (
        <div className="richieste-consenso">
          <h3>Ti sei nascosto ai proprietari</h3>
          <p>I proprietari non vedono il tuo profilo e non possono scriverti. Puoi tornare visibile quando vuoi.</p>
          <button type="button" className="opp-cta" disabled={pending} onClick={() => cambiaVisibilita(true)}>
            Torna visibile
          </button>
        </div>
      )}

      {errore && (
        <p className="note-error" role="alert">
          {errore}
        </p>
      )}

      {/* ---- le richieste ---- */}
      {inAttesa.length === 0 && Object.keys(esiti).length === 0 ? (
        <div className="empty-inline">
          <IconMatch className="icon-empty" />
          <h3>Nessuna richiesta per ora</h3>
          <p>{vis ? "Quando un proprietario sceglie il tuo profilo, la trovi qui e puoi rispondere." : "Finché sei nascosto nessun proprietario può scriverti."}</p>
        </div>
      ) : (
        <ul className="richieste-lista" aria-label="Richieste dei proprietari">
          {[...inAttesa, ...richieste.filter((r) => esiti[r.id] && !inAttesa.includes(r))].map((r) => {
            const esito = esiti[r.id];
            return (
              <li key={r.id} className="richiesta">
                {r.casa?.foto ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={r.casa.foto} alt="" className="richiesta-foto" />
                ) : (
                  <span className="richiesta-foto richiesta-foto-vuota" aria-hidden="true" />
                )}
                <div className="richiesta-corpo">
                  <div className="richiesta-chi">{fraseRichiesta(r)}</div>
                  {r.casa ? (
                    <div className="richiesta-casa">
                      <b>{r.casa.titolo}</b>
                      <span>
                        {r.casa.zona} · €{r.casa.prezzo.toLocaleString("it-IT")}/mese
                      </span>
                    </div>
                  ) : (
                    <div className="richiesta-casa">
                      <span>Questa casa non è più disponibile.</span>
                    </div>
                  )}
                  {r.messaggio && <blockquote className="richiesta-messaggio">{r.messaggio}</blockquote>}

                  {esito?.stato === "accettata" ? (
                    <div className="richiesta-esito">
                      <b>È un match!</b> Ora puoi scrivere a {r.nomeProprietario ?? "il proprietario"}.
                      {esito.candidaturaId && (
                        <Link href={`/chat/${esito.candidaturaId}`} className="opp-cta block text-center" style={{ marginTop: 10 }}>
                          Apri la chat
                        </Link>
                      )}
                    </div>
                  ) : esito?.stato === "rifiutata" ? (
                    <div className="richiesta-esito">Hai risposto di no. La richiesta è chiusa.</div>
                  ) : (
                    <div className="richiesta-azioni">
                      <button type="button" className="opp-cta" disabled={pending || !r.casa} onClick={() => rispondi(r.id, true)}>
                        Sì, mi interessa
                      </button>
                      <button type="button" className="richieste-secondario" disabled={pending} onClick={() => rispondi(r.id, false)}>
                        No, grazie
                      </button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
