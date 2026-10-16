"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { allegaDocumentoAffitto } from "@/app/(app)/gestione/affitto-actions";
import { TESTI_CARICA_CONTRATTO } from "@/lib/affitto-contratto";
import { estensioneDa, messaggioErroreVerifica, percorsoDocumento, validaFileDocumento } from "@/lib/verifica";

/**
 * Per un affitto nato da un contratto: una delle due parti carica la copia del contratto registrato, che vede solo lo staff. Il file va
 * nell'archivio di verifica, nella cartella di chi lo carica (come per gli affitti dichiarati), poi si collega all'affitto.
 */
export function CaricaContrattoRapporto({ rapportoId, onFatto }: { rapportoId: string; onFatto: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [occupato, setOccupato] = useState(false);

  async function carica() {
    setErrore(null);
    if (!file) return setErrore("Scegli il file del contratto.");
    const ef = validaFileDocumento(file);
    if (ef) return setErrore(ef);
    const estensione = estensioneDa(file.type);
    if (!estensione) return setErrore("Il file deve essere un PDF, una foto JPG o una foto PNG.");

    setOccupato(true);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return setErrore(messaggioErroreVerifica("NON_AUTENTICATO"));

      const percorso = percorsoDocumento({ userId: user.id, tipo: "contratto", listingId: null, estensione, id: crypto.randomUUID() });
      const { error: eFile } = await supabase.storage.from("documenti-verifica").upload(percorso, file, { contentType: file.type, upsert: false });
      if (eFile) return setErrore("Non sono riuscito a caricare il contratto. Riprova.");

      const r = await allegaDocumentoAffitto(rapportoId, percorso);
      if (!r.ok) return setErrore(r.error);
      setFile(null);
      onFatto();
    } finally {
      setOccupato(false);
    }
  }

  return (
    <div className="carica-contratto">
      <div className="carica-contratto-titolo">{TESTI_CARICA_CONTRATTO.titolo}</div>
      <p className="field-note" style={{ margin: "2px 0 8px 0" }}>
        {TESTI_CARICA_CONTRATTO.spiegazione}
      </p>
      <label className="chip selettore-file">
        {file ? file.name : "Scegli il file"}
        <input type="file" accept="application/pdf,image/jpeg,image/png" aria-label="Il contratto" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </label>
      {errore && (
        <p className="note-error" role="alert" style={{ marginTop: 8 }}>
          {errore}
        </p>
      )}
      <button type="button" className="opp-cta" style={{ marginTop: 10 }} disabled={occupato || !file} onClick={carica}>
        {occupato ? "Invio..." : TESTI_CARICA_CONTRATTO.pulsante}
      </button>
    </div>
  );
}
