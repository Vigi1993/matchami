"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Sheet } from "@/components/Sheet";
import { SchedaPersona } from "@/components/SchedaPersona";
import { faiMatch } from "@/app/(app)/database/actions";
import { datiSchedaPossibile } from "@/lib/database-proprietario";
import { frasePossibili } from "@/lib/proprietario/home";
import { MESSAGGIO_RICHIESTA_MAX } from "@/lib/richieste";
import type { PossibiliPerCasa } from "@/lib/proprietario/possibili-server";
import type { SchedaInquilino } from "@/lib/proprietario/possibili-inquilini";

/**
 * I possibili match di una casa: quanti inquilini cercano una casa come questa e le persone che si possono contattare, con il
 * pulsante «Fai match» (prima una conferma, con due parole facoltative). Più sotto le richieste già mandate.
 */
export function PossibiliMatch({ casa }: { casa: PossibiliPerCasa }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [scelta, setScelta] = useState<SchedaInquilino | null>(null);
  const [messaggio, setMessaggio] = useState("");
  const [errore, setErrore] = useState<string | null>(null);
  const [avviso, setAvviso] = useState<string | null>(null);

  const f = casa.possibili === null ? null : frasePossibili(casa.possibili);
  const disponibili = casa.disponibili ?? [];
  const inAttesa = casa.richieste.filter((r) => r.stato === "inviata");
  const accettate = casa.richieste.filter((r) => r.stato === "accettata");
  const rifiutate = casa.richieste.filter((r) => r.stato === "rifiutata").length;

  function chiudi() {
    setScelta(null);
    setMessaggio("");
    setErrore(null);
  }

  function invia() {
    if (!scelta) return;
    setErrore(null);
    startTransition(async () => {
      const r = await faiMatch(casa.id, scelta.tenantId, messaggio);
      if (!r.ok) return setErrore(r.error);
      setAvviso(`Richiesta inviata a ${scelta.nome}`);
      chiudi();
      router.refresh();
    });
  }

  return (
    <div className="possibili-match">
      {avviso && (
        <p className="possibili-avviso" role="status">
          {avviso}
        </p>
      )}

      <p className="possibili-testo" style={{ marginTop: 0 }}>
        {f ? (
          <>
            <b>
              {f.numero} {f.numero === "0" ? "" : f.frase}
            </b>
            {f.numero === "0" && f.frase}
          </>
        ) : (
          "Il numero non è disponibile in questo momento."
        )}
        {casa.possibili !== null && casa.possibili > 0 && casa.disponibili !== null && (
          <>
            {" "}
            {disponibili.length === 0
              ? "Hanno scelto di non farsi trovare dai proprietari: se una di loro si candida, la trovi tra le candidature."
              : disponibili.length === 1
                ? "Puoi contattare questa persona:"
                : `Puoi contattare ${disponibili.length} di queste persone:`}
          </>
        )}
      </p>

      {disponibili.length > 0 && (
        <ul className="schede-lista" aria-label={`Possibili match per ${casa.titolo}`}>
          {disponibili.map((s) => (
            <li key={s.tenantId}>
              <SchedaPersona dati={datiSchedaPossibile(s)}>
                <button type="button" className="opp-cta persona-primario" disabled={pending} onClick={() => setScelta(s)}>
                  Fai match
                </button>
              </SchedaPersona>
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

      <p className="possibili-testo">
        Sono persone iscritte che cercano una casa adatta alla tua. Chi ha scelto di non farsi trovare non compare, e i contatti di nessuno sono visibili:
        se accetta la tua richiesta, o se si candida, la trovi tra le candidature e potete scrivervi.
      </p>

      <Sheet open={scelta !== null} onClose={chiudi} title={scelta ? `Fai match con ${scelta.nome}?` : "Fai match"}>
        {scelta && (
          <>
            <p className="possibili-testo" style={{ marginTop: 0 }}>
              Le arriverà una richiesta per <b>{casa.titolo}</b>. Se accetta, potete scrivervi in chat. Se non risponde o dice di no, non succede niente.
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
    </div>
  );
}
