"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { messaggioErroreVerifica } from "@/lib/verifica";
import {
  AVVISO_ANNULLAMENTO_ALL_INQUILINO,
  AVVISO_ANNULLAMENTO_AL_PROPRIETARIO,
  NESSUN_POSTO_PER_INQUILINO,
  NESSUNA_VISITA_PER_PROPRIETARIO,
  formattaOra,
  formattaQuando,
  raggruppaPostiPerGiorno,
  visitaAnnullataRecente,
  visitaAttiva,
  type PostoLibero,
  type VisitaCandidatura,
} from "@/lib/visite";

/**
 * La visita di un match, dentro la chat. L'inquilino prenota uno dei posti
 * che il proprietario ha indicato; l'uno e l'altro possono annullare finché la
 * visita non è passata. Le regole vere stanno nel database (migrazione 0022).
 */
export function VisitaChat({
  candidaturaId,
  ruolo,
  visite,
  posti,
}: {
  candidaturaId: string;
  ruolo: "inquilino" | "proprietario" | string;
  visite: VisitaCandidatura[];
  posti: PostoLibero[];
}) {
  const router = useRouter();
  const [adesso] = useState(() => Date.now());
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState<string | null>(null);
  const [confermaAnnullo, setConfermaAnnullo] = useState(false);

  const inquilino = ruolo !== "proprietario";
  const attiva = visitaAttiva(visite, adesso);
  const annullata = visitaAnnullataRecente(visite, adesso);
  const giorni = raggruppaPostiPerGiorno(posti);

  async function chiama(chiave: string, nome: string, args: Record<string, unknown>): Promise<boolean> {
    setErrore(null);
    setInCorso(chiave);
    try {
      const { error } = await createClient().rpc(nome, args);
      if (error) {
        setErrore(messaggioErroreVerifica(error.message));
        return false;
      }
      router.refresh();
      return true;
    } finally {
      setInCorso(null);
    }
  }

  const titolo = attiva
    ? `Visita: ${formattaQuando(attiva.data_ora)}`
    : inquilino
      ? "Prenota una visita"
      : "Visita";

  return (
    <details className="chat-visita">
      <summary>{titolo}</summary>

      {attiva ? (
        <div className="chat-visita-corpo">
          <p>
            <b>Visita confermata:</b> {formattaQuando(attiva.data_ora)}.
          </p>
          {confermaAnnullo ? (
            <div className="chat-conferma" role="alertdialog" aria-label="Annulla la visita">
              <p>{inquilino ? AVVISO_ANNULLAMENTO_ALL_INQUILINO : AVVISO_ANNULLAMENTO_AL_PROPRIETARIO}</p>
              <div className="flex gap-3">
                <button type="button" className="btn-danger-outline" style={{ borderColor: "rgba(16,21,26,.14)", color: "var(--ink)" }} onClick={() => setConfermaAnnullo(false)}>
                  Indietro
                </button>
                <button
                  type="button"
                  className="opp-cta"
                  disabled={inCorso !== null}
                  onClick={async () => {
                    if (await chiama("annulla", "annulla_visita", { p_visita: attiva.visita_id })) setConfermaAnnullo(false);
                  }}
                >
                  {inCorso === "annulla" ? "Annullo..." : "Sì, annulla la visita"}
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="redo-link" onClick={() => setConfermaAnnullo(true)}>
              Annulla la visita
            </button>
          )}
        </div>
      ) : (
        <div className="chat-visita-corpo">
          {annullata && inquilino && (
            <p className="note-box is-no" style={{ marginTop: 0 }}>
              Il proprietario ha annullato la visita di {formattaQuando(annullata.data_ora)}.
            </p>
          )}

          {inquilino ? (
            giorni.length === 0 ? (
              <p className="field-note">{NESSUN_POSTO_PER_INQUILINO}</p>
            ) : (
              <>
                <p className="field-note" style={{ marginTop: 0 }}>
                  Scegli quando vuoi vedere la casa. Gli orari sono quelli di Roma.
                </p>
                {giorni.map((g) => (
                  <div key={g.chiave} className="chat-visita-giorno">
                    <div className="pref-label" style={{ margin: "8px 0 6px 0" }}>
                      <span>{g.etichetta}</span>
                    </div>
                    <div className="chip-row">
                      {g.posti.map((p) => (
                        <button
                          key={p.visita_id}
                          type="button"
                          className="chip"
                          disabled={inCorso !== null}
                          aria-label={`Prenota ${formattaQuando(p.data_ora)}`}
                          onClick={() => chiama(`prenota-${p.visita_id}`, "prenota_visita", { p_visita: p.visita_id, p_candidatura: candidaturaId })}
                        >
                          {inCorso === `prenota-${p.visita_id}` ? "..." : formattaOra(p.data_ora)}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </>
            )
          ) : (
            <p className="field-note" style={{ marginTop: 0 }}>
              {NESSUNA_VISITA_PER_PROPRIETARIO}
            </p>
          )}
        </div>
      )}

      {errore && (
        <p className="note-error" style={{ margin: "8px 14px 10px" }} role="alert">
          {errore}
        </p>
      )}
    </details>
  );
}
