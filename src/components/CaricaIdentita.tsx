"use client";

import { SelettoreFile } from "@/components/SelettoreFile";
import { useVerificaDocumenti } from "@/components/VerificaImmobile";

/**
 * Il documento d'identità del proprietario (carta, patente o passaporto): serve a verificare che la casa è sua. Lo vede solo il team di MatchAmI.
 * Usa lo stesso caricamento di sempre (archivio di verifica, nella cartella di chi lo carica); dopo il caricamento la pagina si aggiorna.
 */
export function CaricaIdentita({ nomiCaricati }: { nomiCaricati: string[] }) {
  const { errore, inCorso, carica } = useVerificaDocumenti();
  return (
    <div className="carica-identita">
      {nomiCaricati.length > 0 && (
        <ul className="elenco-documenti">
          {nomiCaricati.map((n, i) => (
            <li key={`${n}-${i}`}>
              <span>{n}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="field-note">Carta d&apos;identità, patente o passaporto, in PDF o foto (fronte e retro).</p>
      <SelettoreFile
        etichetta={nomiCaricati.length > 0 ? "Aggiungi un altro file" : "Carica il documento"}
        aria="Carica il documento d'identità"
        occupato={inCorso === "identita"}
        onFile={(f) => carica("identita", null, f, "identita")}
      />
      {errore && (
        <p className="note-error" role="alert" style={{ marginTop: 10 }}>
          {errore}
        </p>
      )}
    </div>
  );
}
