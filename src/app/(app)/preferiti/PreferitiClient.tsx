"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { messaggioErroreVerifica } from "@/lib/verifica";
import { IconSegnalibro } from "@/components/icons";
import {
  TESTO_CANDIDATURA_INVIATA,
  TESTO_NESSUN_PREFERITO,
  descrizionePreferito,
  type Preferito,
} from "@/lib/scelte";
import { candidati } from "../actions";

/**
 * Gli annunci salvati. Da qui ci si candida (e l'annuncio esce dai preferiti, lo
 * fa il database) o si toglie.
 */
export function PreferitiClient({ preferiti, errore }: { preferiti: Preferito[]; errore: boolean }) {
  const router = useRouter();
  const [inCorso, setInCorso] = useState<string | null>(null);
  const [messaggio, setMessaggio] = useState<{ errore: boolean; testo: string } | null>(null);

  async function candidatiA(p: Preferito) {
    setMessaggio(null);
    setInCorso(p.listing_id);
    try {
      const res = await candidati(p.listing_id);
      if (res?.error) {
        setMessaggio({ errore: true, testo: res.error });
        return;
      }
      setMessaggio({ errore: false, testo: TESTO_CANDIDATURA_INVIATA });
      router.refresh();
    } finally {
      setInCorso(null);
    }
  }

  async function togli(p: Preferito) {
    setMessaggio(null);
    setInCorso(p.listing_id);
    try {
      const { error } = await createClient().rpc("annulla_scelta", { p_listing: p.listing_id });
      if (error) {
        setMessaggio({ errore: true, testo: messaggioErroreVerifica(error.message) });
        return;
      }
      router.refresh();
    } finally {
      setInCorso(null);
    }
  }

  if (errore) {
    return (
      <div className="note-box is-no" style={{ marginTop: 0 }} role="alert">
        <b>Non è stato possibile caricare i preferiti.</b> Riprova tra poco.
      </div>
    );
  }

  if (preferiti.length === 0) {
    return (
      <div className="empty-inline">
        <IconSegnalibro className="icon-empty" />
        <h3>Nessun preferito ancora</h3>
        <p>{TESTO_NESSUN_PREFERITO}</p>
      </div>
    );
  }

  return (
    <>
      {messaggio && (
        <div className={`note-box ${messaggio.errore ? "is-no" : ""}`} style={{ marginTop: 0 }} role={messaggio.errore ? "alert" : "status"}>
          {messaggio.testo}
        </div>
      )}
      <ul className="preferiti-lista">
        {preferiti.map((p) => (
          <li key={p.listing_id} className="preferito">
            {p.foto ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.foto} alt="" />
            ) : (
              <div className="mc-avatar">{p.titolo.slice(0, 2).toUpperCase()}</div>
            )}
            <div className="mc-body">
              <div className="mc-zona">{p.zona}</div>
              <div className="mc-title">{p.titolo}</div>
              <div className="mc-meta">{descrizionePreferito(p)}</div>
              <div className="preferito-azioni">
                <button type="button" className="redo-link" disabled={inCorso !== null} onClick={() => togli(p)} aria-label={`Togli ${p.titolo} dai preferiti`}>
                  Togli
                </button>
                <button type="button" className="opp-cta" disabled={inCorso !== null} onClick={() => candidatiA(p)} aria-label={`Candidati a ${p.titolo}`}>
                  {inCorso === p.listing_id ? "Un attimo..." : "Candidati"}
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
