"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { TESTO_NESSUN_VALORE, riepilogoFirme } from "@/lib/firma/stato";
import type { FirmaContratto as Firma } from "@/lib/firma/tipi";
import { firmaContratto, ritiraFirma } from "@/app/(app)/contratto/firma-actions";

/**
 * La firma di PROVA del contratto. Ognuna delle due parti firma la versione che vede nella bozza; se i dati cambiano
 * dopo, la firma risulta superata e si rifà. Non ha valore legale e non rende mai il contratto «firmato»: lo dice
 * in ogni schermata.
 */
export function FirmaContratto({
  contrattoId,
  statoContratto,
  firme,
  improntaAttuale,
}: {
  contrattoId: string;
  statoContratto: string;
  firme: Firma[];
  improntaAttuale: string | null;
}) {
  const router = useRouter();
  const [fase, setFase] = useState<"riposo" | "conferma" | "ritira">("riposo");
  const [inCorso, setInCorso] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const r = riepilogoFirme({ statoContratto, firme, improntaAttuale });

  async function esegui(azione: () => Promise<{ ok: true } | { error: string }>) {
    setErrore(null);
    setInCorso(true);
    try {
      const esito = await azione();
      if ("error" in esito) {
        setErrore(esito.error);
        return;
      }
      setFase("riposo");
      router.refresh();
    } catch {
      setErrore("Non sono riuscito a completare l'operazione. Riprova.");
    } finally {
      setInCorso(false);
    }
  }

  return (
    <div className="firma-contratto" style={{ margin: "0 0 18px 0" }}>
      <div className="pref-label" style={{ margin: "0 0 4px 0" }}>
        <span>Firma di prova</span>
      </div>
      <p className="field-note" style={{ margin: "0 0 8px 0" }}>
        {TESTO_NESSUN_VALORE}
      </p>

      <ul style={{ listStyle: "none", padding: 0, margin: "0 0 8px 0" }}>
        {r.righe.map((riga) => (
          <li key={riga.ruolo} style={{ padding: "4px 0" }}>
            <b>
              {riga.etichetta}
              {riga.mia ? " (tu)" : ""}
            </b>
            <div className={riga.valida === false ? "note-error" : "field-note"} style={{ margin: 0 }}>
              {riga.testo}
            </div>
          </li>
        ))}
      </ul>

      <p className="field-note" style={{ margin: "0 0 8px 0" }}>
        {r.sintesi}
      </p>

      {errore && (
        <p className="note-error" role="alert" style={{ margin: "0 0 8px 0" }}>
          {errore}
        </p>
      )}

      {r.puoFirmare && fase !== "conferma" && (
        <button type="button" className="opp-cta" onClick={() => setFase("conferma")} disabled={inCorso}>
          {r.haUnaFirmaMia ? "Rifirma di prova" : "Firma di prova"}
        </button>
      )}

      {r.puoFirmare && fase === "conferma" && (
        <div className="note-box" style={{ marginTop: 0 }}>
          <p style={{ margin: "0 0 8px 0" }}>
            Firmi di prova la versione del contratto che vedi nella bozza. Se i dati cambiano dopo, la firma risulta superata e va rifatta.
          </p>
          <div style={{ display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
            <Link href={`/contratto/${contrattoId}`} className="redo-link">
              Vedi la bozza
            </Link>
            <button type="button" className="redo-link" onClick={() => setFase("riposo")} disabled={inCorso}>
              Indietro
            </button>
            <button type="button" className="opp-cta" disabled={inCorso} onClick={() => esegui(() => firmaContratto(contrattoId))}>
              {inCorso ? "Registro..." : "Confermo la firma di prova"}
            </button>
          </div>
        </div>
      )}

      {!r.puoFirmare && r.motivo && <p className="field-note">{r.motivo}</p>}

      {r.haUnaFirmaMia &&
        (fase === "ritira" ? (
          <span className="visite-conferma">
            <span>Vuoi ritirare la tua firma di prova?</span>
            <button type="button" className="redo-link" onClick={() => setFase("riposo")} disabled={inCorso}>
              Indietro
            </button>
            <button type="button" className="redo-link" disabled={inCorso} onClick={() => esegui(() => ritiraFirma(contrattoId))}>
              {inCorso ? "Ritiro..." : "Sì, ritira"}
            </button>
          </span>
        ) : (
          <button type="button" className="redo-link" style={{ marginTop: 6 }} onClick={() => setFase("ritira")} disabled={inCorso}>
            Ritira la mia firma di prova
          </button>
        ))}
    </div>
  );
}
