"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SelettoreFile } from "@/components/SelettoreFile";
import {
  BUCKET_DOCUMENTI_CONTRATTO,
  LIMITI_DOCUMENTI,
  TESTO_ARCHIVIO,
  TESTO_LIMITE_RAGGIUNTO,
  TIPI_DOCUMENTO,
  chiHaCaricato,
  estensioneDichiarata,
  etichettaTipo,
  formattaDimensione,
  percorsoArchivio,
  postiRimasti,
  validaFileScelto,
  type DocumentoContratto,
  type TipoDocumento,
} from "@/lib/documenti-contratto";
import { messaggioErroreVerifica } from "@/lib/verifica";
import { eliminaDocumento, registraDocumento } from "@/app/(app)/contratto/documenti-actions";

const data = (iso: string) => new Date(iso).toLocaleDateString("it-IT", { timeZone: "Europe/Rome", day: "numeric", month: "short", year: "numeric" });

/**
 * L'archivio dei documenti di un contratto. Li vedono entrambe le parti; ognuno cancella solo i suoi.
 * Il file va dal browser all'archivio (nella cartella di chi lo carica); poi il server lo controlla
 * davvero (che sia un PDF, un JPG o un PNG) e lo registra. Il download passa dal server.
 */
export function ArchivioContratto({ contrattoId, documenti }: { contrattoId: string; documenti: DocumentoContratto[] }) {
  const router = useRouter();
  const [tipo, setTipo] = useState<TipoDocumento>("ricevuta");
  const [inCorso, setInCorso] = useState<string | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [daEliminare, setDaEliminare] = useState<string | null>(null);

  const posti = postiRimasti(documenti.length);

  async function carica(file: File | undefined) {
    if (!file) return;
    setErrore(null);
    const problema = validaFileScelto(file);
    if (problema) {
      setErrore(problema);
      return;
    }
    const estensione = estensioneDichiarata(file.type);
    if (!estensione) {
      setErrore("Il file deve essere un PDF, una foto JPG o una foto PNG.");
      return;
    }

    setInCorso("carica");
    let percorso: string | null = null;
    const supabase = createClient();
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setErrore(messaggioErroreVerifica("NON_AUTENTICATO"));
        return;
      }
      percorso = percorsoArchivio({ userId: user.id, id: crypto.randomUUID(), estensione });

      const { error: eFile } = await supabase.storage.from(BUCKET_DOCUMENTI_CONTRATTO).upload(percorso, file, { contentType: file.type, upsert: false });
      if (eFile) {
        percorso = null; // non è arrivato: niente da togliere
        setErrore("Non sono riuscito a caricare il file. Riprova.");
        return;
      }

      const esito = await registraDocumento(contrattoId, tipo, percorso, file.name);
      if ("error" in esito) {
        setErrore(esito.error);
        return; // il server ha già provato a togliere il file; il blocco finally riprova (non costa niente, e vale come seconda possibilità)
      }
      percorso = null; // registrato: non si tocca
      router.refresh();
    } catch {
      setErrore("Non sono riuscito a completare il caricamento. Riprova.");
    } finally {
      // se il file è arrivato ma la registrazione non si è conclusa (rete caduta), non lo si lascia nell'archivio
      if (percorso) await supabase.storage.from(BUCKET_DOCUMENTI_CONTRATTO).remove([percorso]).catch(() => undefined);
      setInCorso(null);
    }
  }

  async function elimina(id: string) {
    setErrore(null);
    setInCorso(`elimina-${id}`);
    try {
      const esito = await eliminaDocumento(id);
      if ("error" in esito) {
        setErrore(esito.error);
        return;
      }
      setDaEliminare(null);
      router.refresh();
    } catch {
      setErrore("Non sono riuscito a eliminare il documento. Riprova.");
    } finally {
      setInCorso(null);
    }
  }

  return (
    <div className="archivio-contratto" style={{ margin: "0 0 18px 0" }}>
      <div className="pref-label" style={{ margin: "0 0 4px 0" }}>
        <span>
          Documenti — {documenti.length} di {LIMITI_DOCUMENTI.maxPerContratto}
        </span>
      </div>
      <p className="field-note" style={{ margin: "0 0 8px 0" }}>
        {TESTO_ARCHIVIO}
      </p>

      {documenti.length === 0 ? (
        <p className="field-note">Nessun documento ancora.</p>
      ) : (
        <ul className="archivio-lista" style={{ listStyle: "none", padding: 0, margin: "0 0 12px 0" }}>
          {documenti.map((d) => (
            <li key={d.id} className="archivio-voce" style={{ padding: "8px 0", borderBottom: "1px solid rgba(16,21,26,0.08)" }}>
              <div>
                <b>{etichettaTipo(d.tipo)}</b>
                <div className="field-note" style={{ margin: 0 }}>
                  {d.nome_file}
                </div>
                <div className="field-note" style={{ margin: 0 }}>
                  {formattaDimensione(d.dimensione)} · {data(d.created_at)} · {chiHaCaricato(d)}
                </div>
              </div>
              <div style={{ display: "flex", gap: 16, marginTop: 4, alignItems: "center" }}>
                <a href={`/contratto/${contrattoId}/documenti/${d.id}`} className="redo-link" download aria-label={`Scarica ${d.nome_file}`}>
                  Scarica
                </a>
                {d.mio &&
                  (daEliminare === d.id ? (
                    <span className="visite-conferma">
                      <span>Il file verrà tolto anche all&apos;altra parte.</span>
                      <button type="button" className="redo-link" onClick={() => setDaEliminare(null)}>
                        Indietro
                      </button>
                      <button type="button" className="redo-link" disabled={inCorso !== null} onClick={() => elimina(d.id)}>
                        {inCorso === `elimina-${d.id}` ? "Elimino..." : "Sì, elimina"}
                      </button>
                    </span>
                  ) : (
                    <button type="button" className="redo-link" aria-label={`Elimina ${d.nome_file}`} onClick={() => setDaEliminare(d.id)}>
                      Elimina
                    </button>
                  ))}
              </div>
            </li>
          ))}
        </ul>
      )}

      {errore && (
        <p className="note-error" role="alert" style={{ margin: "0 0 8px 0" }}>
          {errore}
        </p>
      )}

      {posti === 0 ? (
        <p className="field-note">{TESTO_LIMITE_RAGGIUNTO}</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Tipo di documento" style={{ marginBottom: 8 }}>
            {TIPI_DOCUMENTO.map((t) => (
              <button key={t.id} type="button" className={`chip ${tipo === t.id ? "on" : ""}`} aria-pressed={tipo === t.id} onClick={() => setTipo(t.id)}>
                {t.etichetta}
              </button>
            ))}
          </div>
          <SelettoreFile etichetta="Carica un documento" aria={`Carica un documento: ${etichettaTipo(tipo)}`} occupato={inCorso === "carica"} onFile={carica} />
          <p className="field-note" style={{ marginTop: 6 }}>
            PDF, JPG o PNG, fino a 10 MB.
          </p>
        </>
      )}
    </div>
  );
}
