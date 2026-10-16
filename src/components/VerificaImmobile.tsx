"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SelettoreFile } from "@/components/SelettoreFile";
import { datiMancanti } from "@/lib/annunci/obbligatori";
import {
  cosaManca,
  dataDocumento,
  descriviStato,
  estensioneDa,
  messaggioErroreVerifica,
  percorsoDocumento,
  puoInviare,
  validaFileDocumento,
} from "@/lib/verifica";
import type { ImmobileVerifica } from "@/lib/verifica";

export const BADGE_VERIFICA = {
  ok: "is-match",
  attesa: "is-wait",
  da_fare: "is-off",
  respinto: "is-alert",
} as const;

/**
 * Caricare un documento di verifica e chiedere la verifica di un immobile: lo stesso codice per la Home di chi non ha ancora un immobile verificato
 * e per la scheda di ogni immobile. Il file va nell'archivio di verifica, nella cartella di chi lo carica; poi si registra; poi, quando c'è tutto,
 * si chiede la verifica (le regole vere le controlla il database).
 */
export function useVerificaDocumenti() {
  const router = useRouter();
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState<string | null>(null);

  async function carica(tipo: "identita" | "proprieta", listingId: string | null, file: File | undefined, chiave: string) {
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

      const percorso = percorsoDocumento({ userId: user.id, tipo, listingId, estensione, id: crypto.randomUUID() });

      const { error: eFile } = await supabase.storage.from("documenti-verifica").upload(percorso, file, { contentType: file.type, upsert: false });
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
      const { error } = await createClient().rpc("richiedi_verifica_immobile", { p_listing: listingId });
      if (error) {
        setErrore(messaggioErroreVerifica(error.message));
        return;
      }
      router.refresh();
    } finally {
      setInCorso(null);
    }
  }

  /**
   * Rivedere o riscaricare un documento già caricato. L'indirizzo è temporaneo (un minuto) e si crea al momento del tocco con la sessione del proprietario:
   * il file non ha mai un indirizzo pubblico e un indirizzo vecchio non resta in giro. «apri» lo mostra in una nuova scheda, «scarica» lo salva con il suo nome.
   */
  async function vedi(percorso: string, nome: string, modo: "apri" | "scarica") {
    setErrore(null);
    // per «apri» la finestra si apre SUBITO, nel gesto del tocco, e si riempie dopo: altrimenti il telefono può bloccarla
    const finestra = modo === "apri" ? window.open("", "_blank") : null;
    if (finestra) finestra.opener = null;
    setInCorso(`doc-${modo}-${percorso}`);
    try {
      const { data, error } = await createClient()
        .storage.from("documenti-verifica")
        .createSignedUrl(percorso, 60, modo === "scarica" ? { download: nome } : undefined);
      if (error || !data?.signedUrl) {
        finestra?.close();
        setErrore("Non riesco ad aprire il documento. Riprova.");
        return;
      }
      if (finestra) finestra.location.href = data.signedUrl;
      else window.location.assign(data.signedUrl);
    } finally {
      setInCorso(null);
    }
  }

  return { errore, setErrore, inCorso, carica, invia, vedi };
}

/**
 * La verifica di UN immobile: com'è messa, cosa manca, e il modo di caricare la prova di proprietà (visura catastale o atto) e di chiedere la verifica.
 * Sta nella scheda dell'immobile; la Home di chi non ha ancora immobili verificati usa lo stesso componente.
 * `conIdentita`: mostra anche il caricamento del documento d'identità, se manca (la Home lo chiede in un passo a parte).
 */
export function VerificaImmobile({
  immobile,
  haIdentita,
  conIdentita = false,
}: {
  immobile: ImmobileVerifica;
  haIdentita: boolean;
  conIdentita?: boolean;
}) {
  const { errore, inCorso, carica, invia, vedi } = useVerificaDocumenti();
  const documenti = immobile.documenti ?? [];
  const d = descriviStato(immobile.stato, immobile.note);
  const manca = cosaManca(haIdentita, immobile);
  const daCompilare = datiMancanti(immobile.dati).length > 0;

  return (
    <section className="verifica-immobile" aria-label="Prova di proprietà dell'immobile">
      <div className="verifica-immobile-testa">
        <div className="verifica-immobile-titolo">Prova di proprietà</div>
        <span className={`mc-pct ${BADGE_VERIFICA[d.tono]}`}>{d.etichetta}</span>
      </div>

      {immobile.stato === "non_avviata" && immobile.note && <div className="note-stop">Motivo del rifiuto: {immobile.note}</div>}
      <p className="field-note">{d.testo}</p>

      {/* i documenti già caricati: si rivedono e si riscaricano in qualunque momento, anche a casa verificata */}
      <div className="documenti-caricati">
        <div className="documenti-titolo">
          Documenti caricati: <b>{documenti.length}</b>
        </div>
        {documenti.length === 0 ? (
          <p className="field-note">Non hai ancora caricato nessun documento per questa casa.</p>
        ) : (
          <ul className="documenti-lista">
            {documenti.map((doc) => (
              <li key={doc.id} className="documento">
                <div className="documento-nome">{doc.nome}</div>
                {dataDocumento(doc.creatoIl) && <div className="documento-data">Caricato il {dataDocumento(doc.creatoIl)}</div>}
                <div className="documento-azioni">
                  <button
                    type="button"
                    className="documento-bottone"
                    aria-label={`Apri ${doc.nome}`}
                    disabled={inCorso !== null}
                    onClick={() => vedi(doc.percorso, doc.nome, "apri")}
                  >
                    Apri
                  </button>
                  <button
                    type="button"
                    className="documento-bottone primario"
                    aria-label={`Scarica ${doc.nome}`}
                    disabled={inCorso !== null}
                    onClick={() => vedi(doc.percorso, doc.nome, "scarica")}
                  >
                    Scarica
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="riga-doc">
          <span>Visura catastale o atto di proprietà, in PDF o foto.</span>
          <SelettoreFile
            etichetta={documenti.length > 0 ? "Carica un altro documento" : "Carica visura o atto"}
            aria={`Carica un documento di proprietà di ${immobile.titolo}`}
            occupato={inCorso === `proprieta-${immobile.id}`}
            onFile={(f) => carica("proprieta", immobile.id, f, `proprieta-${immobile.id}`)}
          />
        </div>
        <p className="field-note">Li vede solo il team di MatchAmI: mai gli inquilini.</p>
      </div>

      {immobile.stato === "non_avviata" && (
        <>
          {conIdentita && !haIdentita && (
            <div className="riga-doc">
              <span>Il tuo documento d&apos;identità: serve per controllare che il nome coincida.</span>
              <SelettoreFile
                etichetta="Carica il documento"
                aria="Carica il documento d'identità"
                occupato={inCorso === "identita"}
                onFile={(f) => carica("identita", null, f, "identita")}
              />
            </div>
          )}

          {manca.length > 0 && <p className="field-note">Per inviare manca: {manca.join(" e ")}.</p>}
          {daCompilare && <p className="field-note">I dati dell&apos;annuncio li compili qui sotto: ricordati di salvare.</p>}

          <button
            type="button"
            className="opp-cta"
            style={{ marginTop: 10 }}
            disabled={!puoInviare(haIdentita, immobile) || inCorso !== null}
            onClick={() => invia(immobile.id)}
          >
            {inCorso === `invia-${immobile.id}` ? "Invio..." : "Invia per la verifica"}
          </button>
        </>
      )}

      {errore && (
        <p className="note-error" role="alert" style={{ marginTop: 10 }}>
          {errore}
        </p>
      )}
    </section>
  );
}
