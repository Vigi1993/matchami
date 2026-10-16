"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SelettoreFile } from "@/components/SelettoreFile";
import { datiMancanti } from "@/lib/annunci/obbligatori";
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

  return { errore, setErrore, inCorso, carica, invia };
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
  const { errore, inCorso, carica, invia } = useVerificaDocumenti();
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

      {immobile.stato === "non_avviata" && (
        <>
          <p className="field-note">
            Per far verificare la casa carica la visura catastale o l&apos;atto di proprietà, in PDF o foto. Li vede solo il team di MatchAmI: mai gli inquilini.
          </p>
          <div className="riga-doc">
            <span>
              Prove caricate: <b>{immobile.nProprieta}</b>
            </span>
            <SelettoreFile
              etichetta={immobile.nProprieta > 0 ? "Aggiungine un'altra" : "Carica visura o atto"}
              aria={`Carica la prova di proprietà di ${immobile.titolo}`}
              occupato={inCorso === `proprieta-${immobile.id}`}
              onFile={(f) => carica("proprieta", immobile.id, f, `proprieta-${immobile.id}`)}
            />
          </div>

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
