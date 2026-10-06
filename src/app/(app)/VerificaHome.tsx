"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { PageContainer } from "@/components/ui/PageContainer";
import {
  cosaManca,
  descriviStato,
  estensioneDa,
  messaggioErroreVerifica,
  percorsoDocumento,
  puoInviare,
  validaFileDocumento,
} from "@/lib/verifica";
import type { ImmobileVerifica } from "@/lib/verifica";

const BADGE = {
  ok: "is-match",
  attesa: "is-wait",
  da_fare: "is-off",
  respinto: "is-alert",
} as const;

/**
 * La Home di un proprietario che non ha ancora un immobile verificato.
 *
 * Spiega cosa manca e permette di farlo: caricare il documento d'identità,
 * caricare la prova di proprietà di un immobile, inviarlo alla verifica. Il
 * resto dell'app resta raggiungibile dalla barra in basso, ma senza un
 * immobile verificato non c'è nulla da pubblicare né nessuno che si candidi.
 */
export function VerificaHome({
  haIdentita,
  immobili,
}: {
  haIdentita: boolean;
  immobili: ImmobileVerifica[];
}) {
  const router = useRouter();
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState<string | null>(null);

  async function carica(
    tipo: "identita" | "proprieta",
    listingId: string | null,
    file: File | undefined,
    chiave: string
  ) {
    if (!file) return;
    setErrore(null);

    const problema = validaFileDocumento(file);
    if (problema) {
      setErrore(problema);
      return;
    }
    const estensione = estensioneDa(file.type);
    if (!estensione) {
      setErrore("Il file deve essere un PDF, una foto JPG o una foto PNG.");
      return;
    }

    setInCorso(chiave);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setErrore(messaggioErroreVerifica("NON_AUTENTICATO"));
        return;
      }

      const percorso = percorsoDocumento({
        userId: user.id,
        tipo,
        listingId,
        estensione,
        id: crypto.randomUUID(),
      });

      const { error: eFile } = await supabase.storage
        .from("documenti-verifica")
        .upload(percorso, file, { contentType: file.type, upsert: false });
      if (eFile) {
        setErrore("Non sono riuscito a caricare il file. Riprova.");
        return;
      }

      const { error: eRiga } = await supabase.from("documenti_verifica").insert({
        owner_id: user.id,
        listing_id: listingId,
        tipo,
        percorso,
        nome_file: file.name.slice(0, 200),
      });
      if (eRiga) {
        setErrore("Il file è stato caricato ma non registrato. Riprova.");
        return;
      }
      router.refresh();
    } finally {
      setInCorso(null);
    }
  }

  async function invia(listingId: string) {
    setErrore(null);
    setInCorso(`invia-${listingId}`);
    try {
      const { error } = await createClient().rpc("richiedi_verifica_immobile", {
        p_listing: listingId,
      });
      if (error) {
        setErrore(messaggioErroreVerifica(error.message));
        return;
      }
      router.refresh();
    } finally {
      setInCorso(null);
    }
  }

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
            {immobili.map((im) => {
              const d = descriviStato(im.stato, im.note);
              const manca = cosaManca(haIdentita, im);

              return (
                <div key={im.id} className="verifica-card">
                  <div className="verifica-card-testa">
                    <div>
                      <b>{im.titolo}</b>
                      <small>{im.zona}</small>
                    </div>
                    <span className={`mc-pct ${BADGE[d.tono]}`}>{d.etichetta}</span>
                  </div>

                  {im.stato === "non_avviata" && im.note && (
                    <div className="note-stop">Motivo del rifiuto: {im.note}</div>
                  )}
                  <p className="field-note" style={{ margin: "8px 0 10px 0" }}>
                    {d.testo}
                  </p>

                  {im.stato === "non_avviata" && (
                    <>
                      <div className="riga-doc">
                        <span>
                          Prove di proprietà caricate: <b>{im.nProprieta}</b>
                        </span>
                        <SelettoreFile
                          etichetta={im.nProprieta > 0 ? "Aggiungine un'altra" : "Carica visura o atto"}
                          aria={`Carica la prova di proprietà di ${im.titolo}`}
                          occupato={inCorso === `proprieta-${im.id}`}
                          onFile={(f) => carica("proprieta", im.id, f, `proprieta-${im.id}`)}
                        />
                      </div>

                      {manca.length > 0 && (
                        <p className="field-note">Per inviare manca: {manca.join(" e ")}.</p>
                      )}

                      <button
                        type="button"
                        className="opp-cta"
                        style={{ marginTop: 10 }}
                        disabled={!puoInviare(haIdentita, im) || inCorso !== null}
                        onClick={() => invia(im.id)}
                      >
                        {inCorso === `invia-${im.id}` ? "Invio..." : "Invia per la verifica"}
                      </button>
                    </>
                  )}
                </div>
              );
            })}

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

function SelettoreFile({
  etichetta,
  aria,
  occupato,
  onFile,
}: {
  etichetta: string;
  aria: string;
  occupato: boolean;
  onFile: (file: File | undefined) => void;
}) {
  return (
    <label className="chip selettore-file" aria-busy={occupato}>
      {occupato ? "Caricamento..." : etichetta}
      <input
        type="file"
        accept="application/pdf,image/jpeg,image/png"
        aria-label={aria}
        disabled={occupato}
        className="hidden"
        onChange={(e) => {
          onFile(e.target.files?.[0]);
          e.target.value = ""; // permette di riscegliere lo stesso file
        }}
      />
    </label>
  );
}
