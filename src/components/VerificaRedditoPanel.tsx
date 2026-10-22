"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SelettoreFile } from "@/components/SelettoreFile";
import {
  estensioneDa,
  messaggioErroreVerifica,
  percorsoDocumento,
  validaFileDocumento,
} from "@/lib/verifica";
import {
  AIUTO_DOCUMENTO,
  ETICHETTE_DOCUMENTO,
  LIMITE_DOCUMENTI,
  cosaMancaInquilino,
  descriviVerificaReddito,
  puoAggiungereDocumento,
  puoInviareInquilino,
  puoTogliereDocumenti,
  type DatiDichiarati,
  type DocumentoInquilino,
  type StatoVerificaInquilino,
  type TipoDocumentoInquilino,
} from "@/lib/verifica-inquilino";
import {
  CONFERMA_OGNI_GIORNI,
  dataBreve,
  etichettaPersona,
  leggiVerifiche,
  percettoriDaDocumentare,
  puoRinnovare,
  type RigaVerificheInquilino,
} from "@/lib/scadenze-verifiche";

const BUCKET = "documenti-verifica";

/**
 * Il pannello con cui l'inquilino carica i documenti e li invia alla verifica del reddito, e poi la RINNOVA quando scade.
 *
 * Serve una prova del reddito per OGNI persona del nucleo che ha un reddito (la prima è la sua); per i documenti di un'altra persona si chiede
 * la conferma che sia d'accordo. Una verifica vale per un periodo (6 mesi): il pannello dice fino a quando, avvisa quando sta per scadere e permette di
 * rinnovarla senza perdere i punti nel frattempo. Ogni tanto chiede «la tua situazione non è cambiata?».
 *
 * Le regole vere (chi può cambiare lo stato, quali documenti servono, che i documenti si tolgano solo prima dell'invio, la scadenza) stanno nel
 * database. Qui si evita di far fare alla persona cose che il database rifiuterebbe.
 */
export function VerificaRedditoPanel({
  stato,
  nota,
  dati,
  documenti,
  riga,
}: {
  stato: StatoVerificaInquilino;
  nota: string | null;
  dati: DatiDichiarati;
  documenti: DocumentoInquilino[];
  /** la riga dell'inquilino: scadenze, reddito del nucleo dichiarato e verificato, quanti redditi ci sono nel nucleo */
  riga: RigaVerificheInquilino & { redditi_nucleo?: number | null };
}) {
  const router = useRouter();
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState<string | null>(null);
  const [consensoAltri, setConsensoAltri] = useState(false);

  const ver = leggiVerifiche(riga);
  const persone = percettoriDaDocumentare(riga.redditi_nucleo);
  const descrizione = descriviVerificaReddito({ stato, nota, ver });
  const coperturaIncompleta = ver.redditoValido && (ver.coperturaReddito ?? 1) < 1;
  const rinnovabile = ver.reddito !== null && puoRinnovare(ver.reddito, { coperturaIncompleta });
  const manca = cosaMancaInquilino({ documenti, dati, redditiNucleo: riga.redditi_nucleo });
  const inviabile = puoInviareInquilino({ stato, documenti, dati, redditiNucleo: riga.redditi_nucleo, rinnovabile });
  const siTolgono = puoTogliereDocumenti(stato);
  const mostraInvio = stato === "non_avviata" || (stato === "verificato" && rinnovabile);
  const etichettaInvio =
    stato === "non_avviata" ? "Invia per la verifica" : coperturaIncompleta && ver.reddito?.fase === "valida" ? "Invia le prove aggiunte" : "Rinnova la verifica";

  async function carica(tipo: TipoDocumentoInquilino, file: File | undefined, persona: number) {
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

    setInCorso(`carica-${tipo}-${persona}`);
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
        tipo: tipo === "identita" ? "inquilino-identita" : "inquilino-reddito",
        listingId: null,
        estensione,
        id: crypto.randomUUID(),
      });

      const { error: eFile } = await supabase.storage
        .from(BUCKET)
        .upload(percorso, file, { contentType: file.type, upsert: false });
      if (eFile) {
        setErrore("Non sono riuscito a caricare il file. Riprova.");
        return;
      }

      const { error: eRiga } = await supabase.from("documenti_inquilino").insert({
        tenant_id: user.id,
        tipo,
        percorso,
        nome_file: file.name.slice(0, 200),
        persona,
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
      // La sicurezza del database, se non permette di togliere il file, non
      // dà errore: restituisce un elenco vuoto. Senza questo controllo si
      // cancellerebbe la riga lasciando il file.
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
      const { error } = await createClient().rpc("richiedi_verifica_inquilino");
      if (error) {
        setErrore(messaggioErroreVerifica(error.message));
        return;
      }
      router.refresh();
    } finally {
      setInCorso(null);
    }
  }

  async function conferma() {
    setErrore(null);
    setInCorso("conferma");
    try {
      const { error } = await createClient().rpc("conferma_situazione");
      if (error) {
        setErrore(messaggioErroreVerifica(error.message));
        return;
      }
      router.refresh();
    } finally {
      setInCorso(null);
    }
  }

  /** L'elenco dei file di un tipo e di una persona: le prove già verificate si vedono con l'importo, e non si tolgono. */
  function elenco(miei: DocumentoInquilino[]) {
    if (miei.length === 0) return null;
    return (
      <ul className="elenco-documenti">
        {miei.map((d) => (
          <li key={d.id}>
            <span>
              {d.nome_file}
              {d.verificato_at ? ` · verificata${d.importo_verificato ? `: €${d.importo_verificato.toLocaleString("it-IT")}/mese` : ""}` : ""}
            </span>
            {siTolgono && !d.verificato_at && (
              <button type="button" className="redo-link" disabled={inCorso !== null} aria-label={`Togli ${d.nome_file}`} onClick={() => togli(d)}>
                {inCorso === `togli-${d.id}` ? "Tolgo..." : "Togli"}
              </button>
            )}
          </li>
        ))}
      </ul>
    );
  }

  const identita = documenti.filter((d) => d.tipo === "identita");
  const reddito = documenti.filter((d) => d.tipo === "reddito");
  const personaDi = (d: DocumentoInquilino) => d.persona ?? 1;
  // prove di persone che non fanno più parte del nucleo (se ha ridotto i redditi): si vedono comunque
  const fuoriNucleo = reddito.filter((d) => personaDi(d) > persone);

  return (
    <div>
      <div className={`note-box ${descrizione.tono === "no" ? "is-no" : ""}`} style={{ marginTop: 0, marginBottom: 16 }} role="status">
        <b>{descrizione.titolo}</b>
        <br />
        {descrizione.testo}
      </div>

      {/* «la tua situazione non è cambiata?»: ogni tanto, per chi ha una verifica valida */}
      {ver.confermaNecessaria && (
        <div className="note-box" style={{ marginBottom: 16 }}>
          <b>La tua situazione non è cambiata?</b>
          <br />
          Sono passati più di {CONFERMA_OGNI_GIORNI} giorni dall&apos;ultima volta. Se lavori ancora dove lavoravi e i redditi sono gli stessi, conferma: i proprietari
          vedono la verifica ancora «fresca». Non sostituisce i documenti, che vanno rinnovati alla scadenza. Se qualcosa è cambiato, aggiorna i tuoi dati: la verifica va rifatta.
          <div style={{ marginTop: 10 }}>
            <button type="button" className="richieste-secondario" disabled={inCorso !== null} onClick={conferma}>
              {inCorso === "conferma" ? "Un momento..." : "Sì, non è cambiata"}
            </button>
          </div>
        </div>
      )}
      {ver.confermataIl && !ver.confermaNecessaria && ver.redditoValido && (
        <p className="field-note" style={{ marginTop: -6, marginBottom: 14 }}>
          Ultima conferma della tua situazione: {dataBreve(ver.freschezza)}.
        </p>
      )}

      {/* il documento d'identità: uno solo */}
      <div className="passo-verifica" style={{ marginBottom: 12 }}>
        <div className="pref-label" style={{ margin: "0 0 4px 0" }}>
          <span>{ETICHETTE_DOCUMENTO.identita}</span>
        </div>
        <p className="field-note" style={{ margin: "0 0 8px 0" }}>
          {AIUTO_DOCUMENTO.identita}
        </p>
        {elenco(identita)}
        <SelettoreFile
          etichetta={identita.length > 0 ? "Aggiungi un altro file" : "Scegli un file"}
          aria={`Carica: ${ETICHETTE_DOCUMENTO.identita}`}
          occupato={inCorso === "carica-identita-1"}
          onFile={(f) => carica("identita", f, 1)}
        />
      </div>

      {/* una prova del reddito per OGNI persona del nucleo che ha un reddito */}
      {Array.from({ length: persone }, (_, i) => i + 1).map((persona) => {
        const miei = reddito.filter((d) => personaDi(d) === persona);
        const altra = persona > 1;
        return (
          <div key={persona} className="passo-verifica" style={{ marginBottom: 12 }}>
            <div className="pref-label" style={{ margin: "0 0 4px 0" }}>
              <span>
                {ETICHETTE_DOCUMENTO.reddito}
                {persone > 1 ? ` · ${etichettaPersona(persona)}` : ""}
              </span>
            </div>
            <p className="field-note" style={{ margin: "0 0 8px 0" }}>
              {persone > 1 ? (altra ? "La busta paga recente, la CU o la dichiarazione dei redditi di questa persona." : `${AIUTO_DOCUMENTO.reddito} Sono i tuoi.`) : AIUTO_DOCUMENTO.reddito}
            </p>
            {elenco(miei)}
            {altra && (
              <label className="field-note" style={{ display: "flex", gap: 8, alignItems: "flex-start", margin: "0 0 8px 0" }}>
                <input type="checkbox" checked={consensoAltri} onChange={(e) => setConsensoAltri(e.target.checked)} style={{ marginTop: 3 }} />
                <span>Questa persona è d&apos;accordo che il suo documento sia caricato e controllato dal team di MatchAmI.</span>
              </label>
            )}
            {(!altra || consensoAltri) && (
              <SelettoreFile
                etichetta={miei.length > 0 ? "Aggiungi un altro file" : "Scegli un file"}
                aria={`Carica: ${ETICHETTE_DOCUMENTO.reddito}${persone > 1 ? ` · ${etichettaPersona(persona)}` : ""}`}
                occupato={inCorso === `carica-reddito-${persona}`}
                onFile={(f) => carica("reddito", f, persona)}
              />
            )}
          </div>
        );
      })}
      {fuoriNucleo.length > 0 && (
        <div className="passo-verifica" style={{ marginBottom: 12 }}>
          <p className="field-note" style={{ margin: "0 0 4px 0" }}>
            Prove di persone che non risultano più nel nucleo (non contano):
          </p>
          {elenco(fuoriNucleo)}
        </div>
      )}

      {mostraInvio && (
        <>
          {manca.length > 0 && <p className="field-note">Per inviare manca: {manca.join("; ")}.</p>}
          {stato === "verificato" && <p className="field-note">La verifica di adesso resta valida finché non rispondiamo.</p>}
          <button type="button" className="opp-cta" style={{ marginTop: 10 }} disabled={!inviabile || inCorso !== null} onClick={invia}>
            {inCorso === "invia" ? "Invio..." : etichettaInvio}
          </button>
        </>
      )}

      {errore && (
        <p className="note-error" style={{ marginTop: 10 }}>
          {errore}
        </p>
      )}

      <div className="note-box" style={{ marginTop: 20 }}>
        <b>Chi vede i tuoi documenti.</b> Li vedi tu e il team di MatchAmI che li controlla. Il proprietario non li vede mai: vede solo se il reddito è verificato,
        quando, e quanta parte del reddito del nucleo è documentata. Non hanno un indirizzo pubblico e si cancellano insieme al tuo account. Finché non invii la
        richiesta puoi togliere un documento caricato per sbaglio. Quando una verifica viene rinnovata, i documenti vecchi si cancellano. Ti avvisiamo con una
        notifica prima che la verifica scada.
      </div>
    </div>
  );
}
