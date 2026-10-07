"use client";

/**
 * Il pulsante per scegliere un file da caricare (PDF, JPG o PNG). Serve ai
 * documenti dei proprietari e a quelli degli inquilini: stesso aspetto, stessi
 * tipi ammessi.
 */
export function SelettoreFile({
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
