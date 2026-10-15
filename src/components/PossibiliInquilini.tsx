"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sheet } from "@/components/Sheet";
import { BadgeRaccomandato } from "@/components/BadgeRaccomandato";
import { faiMatch } from "@/app/(app)/database/actions";
import { frasePossibili } from "@/lib/proprietario/home";
import { stelleTesto, testoRecensioni } from "@/lib/recensioni";
import { MESSAGGIO_RICHIESTA_MAX } from "@/lib/richieste";
import type { PossibiliPerCasa } from "@/lib/proprietario/possibili-server";
import type { SchedaInquilino } from "@/lib/proprietario/possibili-inquilini";

/**
 * La sezione «Possibili inquilini» del Database: per ogni casa quanti inquilini cercano una casa come quella, e le persone che
 * si sono rese disponibili a essere contattate, con il pulsante «Fai match». Più sotto le richieste già mandate.
 */
export function PossibiliInquilini({ possibili }: { possibili: PossibiliPerCasa[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [scelta, setScelta] = useState<{ casa: PossibiliPerCasa; scheda: SchedaInquilino } | null>(null);
  const [messaggio, setMessaggio] = useState("");
  const [errore, setErrore] = useState<string | null>(null);
  const [avviso, setAvviso] = useState<string | null>(null);

  function chiudi() {
    setScelta(null);
    setMessaggio("");
    setErrore(null);
  }

  function invia() {
    if (!scelta) return;
    setErrore(null);
    startTransition(async () => {
      const r = await faiMatch(scelta.casa.id, scelta.scheda.tenantId, messaggio);
      if (!r.ok) return setErrore(r.error);
      setAvviso(`Richiesta inviata a ${scelta.scheda.nome}`);
      chiudi();
      router.refresh();
    });
  }

  return (
    <section id="possibili" className="possibili" aria-labelledby="possibili-titolo">
      <h2 id="possibili-titolo" className="possibili-titolo">
        Possibili inquilini
      </h2>
      {avviso && (
        <p className="possibili-avviso" role="status">
          {avviso}
        </p>
      )}

      {possibili.length === 0 ? (
        <p className="possibili-testo">Quando la tua casa sarà pubblicata vedrai qui quanti inquilini cercano una casa come la tua.</p>
      ) : (
        possibili.map((p) => {
          const f = p.possibili === null ? null : frasePossibili(p.possibili);
          const inAttesa = p.richieste.filter((r) => r.stato === "inviata");
          const accettate = p.richieste.filter((r) => r.stato === "accettata");
          const rifiutate = p.richieste.filter((r) => r.stato === "rifiutata").length;
          return (
            <div key={p.id} className="possibili-casa">
              <div className="possibili-riga">
                <b className="possibili-numero">{f ? f.numero : "–"}</b>
                <span className="possibili-frase">
                  {f ? f.frase : "Il numero non è disponibile in questo momento"}
                  <small>
                    {p.titolo} · {p.zona}
                  </small>
                </span>
              </div>

              {p.disponibili !== null && p.possibili !== null && p.possibili > 0 && (
                <p className="possibili-testo">
                  {p.disponibili.length === 0
                    ? "Queste persone hanno scelto di non farsi trovare dai proprietari: se una di loro si candida, la trovi tra le candidature."
                    : p.disponibili.length === 1
                      ? "Puoi contattare questa persona:"
                      : `Puoi contattare ${p.disponibili.length} di queste persone:`}
                </p>
              )}

              {(p.disponibili ?? []).length > 0 && (
                <ul className="schede-inquilini" aria-label={`Persone disponibili per ${p.titolo}`}>
                  {(p.disponibili ?? []).map((s) => (
                    <li key={s.tenantId} className="scheda-inquilino">
                      <div className="scheda-testa">
                        {s.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={s.avatarUrl} alt="" className="scheda-foto" />
                        ) : (
                          <span className="scheda-foto scheda-iniziale" aria-hidden="true">
                            {s.nome.slice(0, 1)}
                          </span>
                        )}
                        <div className="scheda-chi">
                          <b>{s.nome}</b>
                          {s.professione && <span>{s.professione}</span>}
                        </div>
                        {s.compatibilita !== null && (
                          <span className="scheda-compat">
                            {s.compatibilita}%<small>adatto</small>
                          </span>
                        )}
                      </div>
                      <div className="scheda-etichette">
                        {s.raccomandato && <BadgeRaccomandato />}
                        {s.redditoVerificato && <span className="scheda-chip">Reddito verificato</span>}
                        <span className="scheda-chip">
                          Affidabilità {s.affidabilita} · {s.etichettaAffidabilita}
                        </span>
                        {s.recensioni.numero > 0 && (
                          <span className="scheda-chip">
                            <span aria-hidden="true">{stelleTesto(s.recensioni.media)}</span> {testoRecensioni(s.recensioni)}
                          </span>
                        )}
                      </div>
                      {s.presentazione && <p className="scheda-presentazione">{s.presentazione}</p>}
                      <button type="button" className="opp-cta scheda-match" disabled={pending} onClick={() => setScelta({ casa: p, scheda: s })}>
                        Fai match
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {(inAttesa.length > 0 || accettate.length > 0 || rifiutate > 0) && (
                <div className="richieste-inviate">
                  <h3>Richieste mandate</h3>
                  <ul>
                    {inAttesa.map((r) => (
                      <li key={r.id}>
                        <b>{r.nome ?? "Una persona"}</b> · in attesa di risposta
                      </li>
                    ))}
                    {accettate.map((r) => (
                      <li key={r.id} className="accettata">
                        <b>Ha accettato!</b> Ora potete scrivervi.
                        {r.candidaturaId && (
                          <Link href={`/chat/${r.candidaturaId}`} className="richieste-link">
                            Apri la chat ›
                          </Link>
                        )}
                      </li>
                    ))}
                    {rifiutate > 0 && <li>{rifiutate === 1 ? "1 persona non ha accettato" : `${rifiutate} persone non hanno accettato`}</li>}
                  </ul>
                </div>
              )}
            </div>
          );
        })
      )}

      <p className="possibili-testo">
        Sono persone iscritte che cercano una casa adatta alla tua. Chi ha scelto di non farsi trovare non compare, e i contatti di nessuno sono
        visibili: se accetta la tua richiesta, o se si candida, la trovi tra le candidature e potete scrivervi.
      </p>

      <Sheet open={scelta !== null} onClose={chiudi} title={scelta ? `Fai match con ${scelta.scheda.nome}?` : "Fai match"}>
        {scelta && (
          <>
            <p className="possibili-testo" style={{ marginTop: 0 }}>
              Le arriverà una richiesta per <b>{scelta.casa.titolo}</b>. Se accetta, potete scrivervi in chat. Se non risponde o dice di no, non succede
              niente.
            </p>
            <label className="field-label" htmlFor="messaggio-richiesta">
              Vuoi aggiungere due parole? (facoltativo)
            </label>
            <textarea
              id="messaggio-richiesta"
              className="ob-textarea"
              rows={3}
              maxLength={MESSAGGIO_RICHIESTA_MAX}
              value={messaggio}
              onChange={(e) => setMessaggio(e.target.value)}
              placeholder="Per esempio: la casa è libera da dicembre, può venire a vederla quando vuole."
            />
            <small className="field-note">
              {messaggio.length}/{MESSAGGIO_RICHIESTA_MAX}
            </small>
            {errore && (
              <p className="note-error" role="alert">
                {errore}
              </p>
            )}
            <div className="possibili-conferma">
              <button type="button" className="opp-cta" disabled={pending} onClick={invia}>
                {pending ? "Invio…" : "Sì, invia la richiesta"}
              </button>
              <button type="button" className="richieste-secondario" disabled={pending} onClick={chiudi}>
                No, torna indietro
              </button>
            </div>
          </>
        )}
      </Sheet>
    </section>
  );
}
