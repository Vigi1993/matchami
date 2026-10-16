"use client";

import { SelettoreFile } from "@/components/SelettoreFile";
import Link from "next/link";
import { PageContainer } from "@/components/ui/PageContainer";
import { VerificaImmobile, useVerificaDocumenti } from "@/components/VerificaImmobile";
import type { ImmobileVerifica } from "@/lib/verifica";

/**
 * La Home di un proprietario che non ha ancora un immobile verificato.
 *
 * Spiega cosa manca e permette di farlo: caricare il documento d'identità,
 * caricare la prova di proprietà di un immobile, inviarlo alla verifica. Il
 * resto dell'app resta raggiungibile dalla barra in basso, ma senza un
 * immobile verificato non c'è nulla da pubblicare né nessuno che si candidi.
 * La prova di proprietà e l'invio di ogni immobile sono gli stessi della scheda dell'immobile (VerificaImmobile).
 */
export function VerificaHome({
  haIdentita,
  immobili,
}: {
  haIdentita: boolean;
  immobili: ImmobileVerifica[];
}) {
  // qui serve solo il documento d'identità: la prova di proprietà di ogni immobile la gestisce il suo componente
  const { errore, inCorso, carica } = useVerificaDocumenti();

  return (
    <PageContainer wide>
      <h1 className="screen-title">Verifica il tuo account</h1>
      <p className="screen-sub">
        Per pubblicare un annuncio e ricevere candidature, MatchAmI controlla
        che l&apos;immobile sia davvero tuo. Lo facciamo noi, a mano.
      </p>

      {errore && (
        <p className="note-error" style={{ marginBottom: 14 }}>
          {errore}
        </p>
      )}

      {/* ---- Passo 1: documento d'identità ---- */}
      <div className="passo-verifica">
        <div className="passo-testa">
          <span className={`passo-numero ${haIdentita ? "fatto" : ""}`}>
            {haIdentita ? "✓" : "1"}
          </span>
          <div>
            <b>Il tuo documento d&apos;identità</b>
            <small>Serve per controllare che il nome coincida con quello sulla prova di proprietà.</small>
          </div>
        </div>
        {!haIdentita && (
          <SelettoreFile
            etichetta="Carica il documento"
            aria={"Carica il documento d'identità"}
            occupato={inCorso === "identita"}
            onFile={(f) => carica("identita", null, f, "identita")}
          />
        )}
      </div>

      {/* ---- Passo 2: l'immobile ---- */}
      <div className="passo-verifica">
        <div className="passo-testa">
          <span className="passo-numero">2</span>
          <div>
            <b>Il tuo immobile</b>
            <small>Visura catastale o atto di proprietà, in PDF o foto.</small>
          </div>
        </div>

        {immobili.length === 0 ? (
          <>
            <p className="field-note" style={{ margin: "10px 0 12px 0" }}>
              Non hai ancora aggiunto nessun immobile. Aggiungilo, poi torna
              qui a caricare i documenti.
            </p>
            <Link href="/immobili" className="opp-cta block text-center">
              Aggiungi un immobile
            </Link>
          </>
        ) : (
          <div className="immobili-verifica">
            {immobili.map((im) => (
              <div key={im.id} className="verifica-card verifica-card-colonna">
                <div className="verifica-card-testa">
                  <div>
                    <b>{im.titolo}</b>
                    <small>{im.zona}</small>
                  </div>
                </div>
                <VerificaImmobile immobile={im} haIdentita={haIdentita} />
              </div>
            ))}

            <Link href="/immobili" className="redo-link" style={{ marginTop: 6 }}>
              Aggiungi un altro immobile
            </Link>
          </div>
        )}
      </div>

      <div className="note-box" style={{ marginTop: 22 }}>
        <b>I tuoi documenti.</b> Li vedi tu e il team di MatchAmI che li
        controlla: non vengono mai mostrati agli inquilini e non hanno un
        indirizzo pubblico. Si cancellano insieme al tuo account. Per ora non
        ti avvisiamo quando l&apos;esito è pronto: torna qui per vederlo.
      </div>
    </PageContainer>
  );
}
