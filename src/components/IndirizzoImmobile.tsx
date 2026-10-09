"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { validaIndirizzo, formattaIndirizzo, CITTA_PREDEFINITA } from "@/lib/mappe/indirizzo";
import type { IndirizzoConVista } from "@/lib/mappe/tipi";
import { MappaImmobile } from "@/components/MappaImmobile";
import { rimuoviIndirizzo, salvaIndirizzo } from "@/app/(app)/immobili/indirizzo-actions";

/**
 * L'indirizzo di un immobile, per il proprietario. Lo vedono solo le persone con
 * cui ha un match accettato: agli altri si mostra la zona. Il calcolo della
 * posizione sulla mappa lo fa il fornitore di mappe scelto, lato server.
 */
export function IndirizzoImmobile({
  immobileId,
  salvato,
}: {
  immobileId: string;
  salvato: IndirizzoConVista | null;
}) {
  const router = useRouter();
  const [via, setVia] = useState(salvato?.indirizzo.via ?? "");
  const [civico, setCivico] = useState(salvato?.indirizzo.civico ?? "");
  const [cap, setCap] = useState(salvato?.indirizzo.cap ?? "");
  const [citta, setCitta] = useState(salvato?.indirizzo.citta ?? CITTA_PREDEFINITA);
  const [inCorso, setInCorso] = useState<"salva" | "togli" | null>(null);
  const [messaggio, setMessaggio] = useState<{ errore: boolean; testo: string } | null>(null);
  const [confermaTogli, setConfermaTogli] = useState(false);

  async function salva() {
    const esito = validaIndirizzo({ via, civico, cap, citta });
    if (!esito.ok) {
      setMessaggio({ errore: true, testo: esito.errore });
      return;
    }
    setMessaggio(null);
    setInCorso("salva");
    try {
      const res = await salvaIndirizzo(immobileId, esito.indirizzo);
      if ("error" in res) {
        setMessaggio({ errore: true, testo: res.error });
        return;
      }
      setMessaggio({ errore: false, testo: "Indirizzo salvato." });
      router.refresh();
    } finally {
      setInCorso(null);
    }
  }

  async function togli() {
    setMessaggio(null);
    setInCorso("togli");
    try {
      const res = await rimuoviIndirizzo(immobileId);
      if ("error" in res) {
        setMessaggio({ errore: true, testo: res.error });
        return;
      }
      setVia("");
      setCivico("");
      setCap("");
      setCitta(CITTA_PREDEFINITA);
      setConfermaTogli(false);
      router.refresh();
    } finally {
      setInCorso(null);
    }
  }

  const cambia = (imposta: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    imposta(e.target.value);
    setMessaggio(null);
  };

  return (
    <div className="indirizzo-panel">
      <div className="pref-label" style={{ margin: "0 0 4px 0" }}>
        <span>Indirizzo</span>
      </div>
      <p className="field-note" style={{ margin: "0 0 10px 0" }}>
        L&apos;indirizzo preciso lo vedono solo le persone con cui hai un match accettato. Agli altri si mostra soltanto la zona.
      </p>

      <div className="indirizzo-campi">
        <input className="ricerca-input" aria-label="Via" placeholder="Via" value={via} maxLength={120} autoComplete="off" onChange={cambia(setVia)} />
        <div className="indirizzo-riga">
          <input className="ricerca-input" aria-label="Numero civico" placeholder="Civico" value={civico} maxLength={12} autoComplete="off" onChange={cambia(setCivico)} />
          <input className="ricerca-input" aria-label="CAP" placeholder="CAP" value={cap} maxLength={5} inputMode="numeric" autoComplete="off" onChange={cambia(setCap)} />
        </div>
        <input className="ricerca-input" aria-label="Città" placeholder="Città" value={citta} maxLength={60} autoComplete="off" onChange={cambia(setCitta)} />
      </div>

      {messaggio && (
        <p className={messaggio.errore ? "note-error" : "field-note"} style={{ marginTop: 8 }} role={messaggio.errore ? "alert" : "status"}>
          {messaggio.testo}
        </p>
      )}

      <div className="indirizzo-azioni">
        {salvato &&
          (confermaTogli ? (
            <span className="visite-conferma">
              <span>Chi ha un match non lo vedrà più.</span>
              <button type="button" className="redo-link" onClick={() => setConfermaTogli(false)}>
                Indietro
              </button>
              <button type="button" className="redo-link" disabled={inCorso !== null} onClick={togli}>
                {inCorso === "togli" ? "Tolgo..." : "Sì, toglilo"}
              </button>
            </span>
          ) : (
            <button type="button" className="redo-link" onClick={() => setConfermaTogli(true)}>
              Togli l&apos;indirizzo
            </button>
          ))}
        <button type="button" className="opp-cta" disabled={inCorso !== null} onClick={salva}>
          {inCorso === "salva" ? "Salvo..." : salvato ? "Aggiorna l'indirizzo" : "Salva l'indirizzo"}
        </button>
      </div>

      {salvato && (
        <div className="indirizzo-salvato">
          <p className="field-note" style={{ margin: "12px 0 8px 0" }}>
            Salvato: <b>{formattaIndirizzo(salvato.indirizzo)}</b>
            {salvato.origine === "provvisoria" && " · posizione sulla mappa provvisoria"}
          </p>
          {salvato.vista && <MappaImmobile vista={salvato.vista} />}
        </div>
      )}
    </div>
  );
}
