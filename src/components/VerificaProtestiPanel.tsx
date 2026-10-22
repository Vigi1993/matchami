"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SelettoreFile } from "@/components/SelettoreFile";
import { estensioneDa, messaggioErroreVerifica, percorsoDocumento, validaFileDocumento } from "@/lib/verifica";
import { LIMITE_DOCUMENTI, puoAggiungereDocumento, type DocumentoInquilino } from "@/lib/verifica-inquilino";
import {
  AIUTO_DOCUMENTO_PROTESTI,
  ETICHETTE_DOCUMENTO_PROTESTI,
  TESTI_VERIFICA_PROTESTI,
  TIPI_DOCUMENTO_PROTESTI,
  cosaMancaProtesti,
  descriviVerificaProtesti,
  puoInviareProtesti,
  puoTogliereDocumentiProtesti,
  type StatoProtesti,
} from "@/lib/protesti";

import { leggiVerifiche, puoRinnovare, type RigaVerificheInquilino } from "@/lib/scadenze-verifiche";
const BUCKET = "documenti-verifica";

type Tipo = (typeof TIPI_DOCUMENTO_PROTESTI)[number];

/**
 * Il pannello con cui l'inquilino carica il certificato dei protesti e chiede la verifica allo staff.
 *
 * Le regole vere (chi può cambiare lo stato, quali documenti servono, che i documenti si tolgano solo prima dell'invio, che il risultato dello staff prevale
 * e non si cambia più da soli) stanno nel database. Qui si evita di far fare alla persona cose che il database rifiuterebbe.
 */
export function VerificaProtestiPanel({
  stato,
  nota,
  protestato,
  documenti,
  riga,
}: {
  stato: StatoProtesti;
  nota: string | null;
  /** il valore che vale oggi (se verificato, è quello dello staff) */
  protestato: boolean | null;
  documenti: DocumentoInquilino[];
  /** la riga dell'inquilino: la scadenza dei protesti e il resto delle verifiche */
  riga: RigaVerificheInquilino;
}) {
  const router = useRouter();
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState<string | null>(null);

  const ver = leggiVerifiche(riga);
  const descrizione = descriviVerificaProtesti({ stato, nota, protestato, ver });
  const rinnovabile = ver.protesti !== null && puoRinnovare(ver.protesti);
  const manca = cosaMancaProtesti({ documenti, protestato });
  const inviabile = puoInviareProtesti({ stato, documenti, protestato, rinnovabile });
  const siTolgono = puoTogliereDocumentiProtesti(stato);
  // si può caricare un file finché la verifica non è «verificato», oppure per il rinnovo
  const siCarica = stato !== "verificato" || rinnovabile;

  async function carica(tipo: Tipo, file: File | undefined) {
    if (!file) return;
    setErrore(null);

    if (!puoAggiungereDocumento(documenti.length)) {
      setErrore(`Hai già ${LIMITE_DOCUMENTI} documenti: toglierne uno, o scrivici.`);
      return;
    }
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

    setInCorso(`carica-${tipo}`);
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
        tipo: tipo === "identita" ? "inquilino-identita" : "inquilino-protesti",
        listingId: null,
        estensione,
        id: crypto.randomUUID(),
      });

      const { error: eFile } = await supabase.storage.from(BUCKET).upload(percorso, file, { contentType: file.type, upsert: false });
      if (eFile) {
        setErrore("Non sono riuscito a caricare il file. Riprova.");
        return;
      }

      const { error: eRiga } = await supabase.from("documenti_inquilino").insert({
        tenant_id: user.id,
        tipo,
        percorso,
        nome_file: file.name.slice(0, 200),
      });
      if (eRiga) {
        // un documento personale non deve restare nel bucket senza che nessuno lo veda
        await supabase.storage.from(BUCKET).remove([percorso]);
        setErrore("Non è stato possibile registrare il documento. Riprova.");
        return;
      }
      router.refresh();
    } finally {
      setInCorso(null);
    }
  }

  async function togli(doc: DocumentoInquilino) {
    setErrore(null);
    setInCorso(`togli-${doc.id}`);
    try {
      const supabase = createClient();
      const { data: tolti, error: eFile } = await supabase.storage.from(BUCKET).remove([doc.percorso]);
      // La sicurezza del database, se non permette di togliere il file, non dà errore: restituisce un elenco vuoto.
      // Senza questo controllo si cancellerebbe la riga lasciando il file.
      if (eFile || !tolti || tolti.length === 0) {
        setErrore("Non è stato possibile togliere il documento: forse hai già inviato la richiesta.");
        return;
      }
      const { error: eRiga } = await supabase.from("documenti_inquilino").delete().eq("id", doc.id);
      if (eRiga) {
        setErrore("Il file è stato tolto ma non il suo elenco. Ricarica la pagina.");
        return;
      }
      router.refresh();
    } finally {
      setInCorso(null);
    }
  }

  async function invia() {
    setErrore(null);
    setInCorso("invia");
    try {
      const { error } = await createClient().rpc("richiedi_verifica_protesti");
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
    <div>
      <div className={`note-box ${descrizione.tono === "no" ? "is-no" : ""}`} style={{ marginTop: 0, marginBottom: 16 }} role="status">
        <b>{descrizione.titolo}</b>
        <br />
        {descrizione.testo}
      </div>

      {TIPI_DOCUMENTO_PROTESTI.map((tipo) => {
        const miei = documenti.filter((d) => d.tipo === tipo);
        return (
          <div key={tipo} className="passo-verifica" style={{ marginBottom: 12 }}>
            <div className="pref-label" style={{ margin: "0 0 4px 0" }}>
              <span>{ETICHETTE_DOCUMENTO_PROTESTI[tipo]}</span>
            </div>
            <p className="field-note" style={{ margin: "0 0 8px 0" }}>
              {AIUTO_DOCUMENTO_PROTESTI[tipo]}
            </p>

            {miei.length > 0 && (
              <ul className="elenco-documenti">
                {miei.map((d) => (
                  <li key={d.id}>
                    <span>
                      {d.nome_file}
                      {d.verificato_at ? " · verificato" : ""}
                    </span>
                    {siTolgono && !d.verificato_at && (
                      <button
                        type="button"
                        className="redo-link"
                        disabled={inCorso !== null}
                        aria-label={`Togli ${d.nome_file}`}
                        onClick={() => togli(d)}
                      >
                        {inCorso === `togli-${d.id}` ? "Tolgo..." : "Togli"}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {siCarica && (
              <SelettoreFile
                etichetta={miei.length > 0 ? "Aggiungi un altro file" : "Scegli un file"}
                aria={`Carica: ${ETICHETTE_DOCUMENTO_PROTESTI[tipo]}`}
                occupato={inCorso === `carica-${tipo}`}
                onFile={(f) => carica(tipo, f)}
              />
            )}
          </div>
        );
      })}

      {(stato === "non_avviata" || (stato === "verificato" && rinnovabile)) && (
        <>
          {manca.length > 0 && <p className="field-note">Per inviare manca: {manca.join("; ")}.</p>}
          {stato === "verificato" && <p className="field-note">La verifica di adesso resta valida finché non rispondiamo.</p>}
          <button type="button" className="opp-cta" style={{ marginTop: 10 }} disabled={!inviabile || inCorso !== null} onClick={invia}>
            {inCorso === "invia" ? "Invio..." : stato === "verificato" ? "Rinnova la verifica" : "Invia per la verifica"}
          </button>
        </>
      )}

      {errore && (
        <p className="note-error" style={{ marginTop: 10 }}>
          {errore}
        </p>
      )}

      <div className="note-box" style={{ marginTop: 20 }}>
        <b>Chi vede i tuoi documenti.</b> {TESTI_VERIFICA_PROTESTI.riservatezza}
      </div>
    </div>
  );
}
