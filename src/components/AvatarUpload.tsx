"use client";

import { useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

const MAX_MB = 5;

/**
 * Caricamento della foto profilo dell'inquilino.
 *
 * Il file finisce nel bucket "avatar-inquilini", dentro una cartella che
 * ha come nome l'id dell'utente: è la condizione richiesta dalle policy
 * dello Storage (vedi migrazione 0006). Il componente non salva niente
 * nel database: restituisce l'URL al form che lo contiene, che lo invia
 * insieme al resto dei dati.
 */
export function AvatarUpload({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (url: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [caricamento, setCaricamento] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setErrore("Scegli un file immagine.");
      return;
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setErrore(`L'immagine non può superare ${MAX_MB} MB.`);
      return;
    }

    setCaricamento(true);
    setErrore(null);

    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setErrore("Devi essere autenticato.");
      setCaricamento(false);
      return;
    }

    const estensione = file.name.split(".").pop() || "jpg";
    const percorso = `${user.id}/${crypto.randomUUID()}.${estensione}`;

    const { error } = await supabase.storage
      .from("avatar-inquilini")
      .upload(percorso, file, { upsert: true });

    if (error) {
      setErrore(error.message);
      setCaricamento(false);
      return;
    }

    const { data } = supabase.storage
      .from("avatar-inquilini")
      .getPublicUrl(percorso);

    onChange(data.publicUrl);
    setCaricamento(false);
  }

  return (
    <div>
      <div className={`doc-upload ${value ? "filled" : ""} flex items-center gap-4`}>
        {value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={value}
            alt="La tua foto profilo"
            className="w-20 h-20 rounded-full object-cover shrink-0"
          />
        ) : (
          <div className="avatar shrink-0" style={{ width: 80, height: 80 }}>
            ?
          </div>
        )}

        <div className="flex-1 min-w-0">
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            disabled={caricamento}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={caricamento}
            className="chip"
          >
            {caricamento
              ? "Caricamento..."
              : value
                ? "Cambia foto"
                : "Scegli una foto"}
          </button>
          {value && !caricamento && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="redo-link ml-3"
              style={{ color: "var(--clay)" }}
            >
              Rimuovi
            </button>
          )}
          <p className="field-note">
            JPG o PNG, massimo {MAX_MB} MB. La vedono i proprietari quando
            valutano la tua candidatura.
          </p>
          {errore && <p className="note-error mt-1">{errore}</p>}
        </div>
      </div>
    </div>
  );
}
