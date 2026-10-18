import Link from "next/link";
import { frasePossibili } from "@/lib/proprietario/home";
import type { PossibiliPerCasa } from "@/lib/proprietario/possibili-server";

/**
 * Sotto le persone di un immobile: quanti inquilini cercano una casa come questa (anche chi non si può contattare), le richieste già mandate
 * e il perché non si vedono i contatti. Le persone che si possono contattare sono nell'elenco, con le altre; qui c'è solo ciò che le spiega.
 */
export function InfoPossibili({ casa }: { casa: PossibiliPerCasa }) {
  const f = casa.possibili === null ? null : frasePossibili(casa.possibili);
  const disponibili = casa.disponibili ?? [];
  const inAttesa = casa.richieste.filter((r) => r.stato === "inviata");
  const accettate = casa.richieste.filter((r) => r.stato === "accettata");
  const rifiutate = casa.richieste.filter((r) => r.stato === "rifiutata").length;

  return (
    <div className="possibili-match db-info-possibili">
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
                ? "Puoi contattare questa persona."
                : `Puoi contattare ${disponibili.length} di queste persone.`}
          </>
        )}
      </p>

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
    </div>
  );
}
