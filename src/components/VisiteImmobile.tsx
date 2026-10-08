"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { messaggioErroreVerifica } from "@/lib/verifica";
import {
  AVVISO_ANNULLAMENTO_AL_PROPRIETARIO,
  SUGGERIMENTO_POSTI,
  daInputRoma,
  formattaQuando,
  limitiSelezione,
  raggruppaVisiteImmobile,
  validaNuovoPosto,
  type VisitaProprietario,
} from "@/lib/visite";

/**
 * Le visite di un immobile, per il proprietario: aggiunge i posti in cui è
 * disponibile, vede chi ha prenotato, toglie un posto libero o annulla una
 * visita. Le regole vere stanno nelle funzioni del database (migrazione 0022).
 */
export function VisiteImmobile({
  immobileId,
  visite,
}: {
  immobileId: string;
  visite: VisitaProprietario[];
}) {
  const router = useRouter();
  // «adesso» si fissa quando la schermata si apre: cambiarlo a ogni disegno farebbe
  // muovere i limiti del campo sotto le dita di chi lo sta usando
  const [adesso] = useState(() => Date.now());
  const [valore, setValore] = useState("");
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState<string | null>(null);
  const [daAnnullare, setDaAnnullare] = useState<string | null>(null);

  const { prenotate, liberi, chiuse } = raggruppaVisiteImmobile(visite, immobileId, adesso);
  const limiti = limitiSelezione(adesso);

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

  async function aggiungi() {
    const iso = daInputRoma(valore);
    // La regola vera la applica il database, con l'ora di quel momento: qui, con l'ora di
    // quando si è aperta la schermata, si evita solo di chiamarlo per un errore ovvio.
    const problema = validaNuovoPosto(
      iso,
      adesso,
      [...prenotate, ...liberi].map((v) => v.data_ora),
      liberi.length
    );
    if (problema) {
      setErrore(problema);
      return;
    }
    if (await chiama("aggiungi", "crea_slot_visita", { p_listing: immobileId, p_data_ora: iso })) setValore("");
  }

  return (
    <div className="visite-panel">
      <div className="pref-label" style={{ margin: "0 0 4px 0" }}>
        <span>Visite</span>
      </div>
      <p className="field-note" style={{ margin: "0 0 10px 0" }}>
        {SUGGERIMENTO_POSTI}
      </p>

      <div className="visite-aggiungi">
        <input
          type="datetime-local"
          className="ricerca-input"
          aria-label="Data e ora del nuovo posto"
          value={valore}
          min={limiti.min}
          max={limiti.max}
          step={900}
          onChange={(e) => {
            setValore(e.target.value);
            setErrore(null);
          }}
        />
        <button type="button" className="opp-cta" disabled={!valore || inCorso !== null} onClick={aggiungi}>
          {inCorso === "aggiungi" ? "Aggiungo..." : "Aggiungi un posto"}
        </button>
      </div>
      <p className="field-note" style={{ margin: "6px 0 0 0" }}>
        Gli orari sono quelli di Roma. Tra due posti servono almeno 30 minuti.
      </p>

      {errore && (
        <p className="note-error" style={{ marginTop: 8 }} role="alert">
          {errore}
        </p>
      )}

      {prenotate.length > 0 && (
        <>
          <div className="sotto-label">Prenotate — {prenotate.length}</div>
          <ul className="visite-lista">
            {prenotate.map((v) => (
              <li key={v.visita_id}>
                <span>
                  <b>{formattaQuando(v.data_ora)}</b>
                  <br />
                  {v.nome_inquilino ?? "Utente"}
                </span>
                {daAnnullare === v.visita_id ? (
                  <span className="visite-conferma">
                    <span>{AVVISO_ANNULLAMENTO_AL_PROPRIETARIO}</span>
                    <button type="button" className="redo-link" onClick={() => setDaAnnullare(null)}>
                      Indietro
                    </button>
                    <button
                      type="button"
                      className="redo-link"
                      disabled={inCorso !== null}
                      onClick={async () => {
                        if (await chiama(`annulla-${v.visita_id}`, "annulla_visita", { p_visita: v.visita_id })) setDaAnnullare(null);
                      }}
                    >
                      {inCorso === `annulla-${v.visita_id}` ? "Annullo..." : "Sì, annulla"}
                    </button>
                  </span>
                ) : (
                  <button type="button" className="redo-link" onClick={() => setDaAnnullare(v.visita_id)}>
                    Annulla la visita
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {liberi.length > 0 && (
        <>
          <div className="sotto-label">Posti liberi — {liberi.length}</div>
          <ul className="visite-lista">
            {liberi.map((v) => (
              <li key={v.visita_id}>
                <span>{formattaQuando(v.data_ora)}</span>
                <button
                  type="button"
                  className="redo-link"
                  aria-label={`Togli il posto di ${formattaQuando(v.data_ora)}`}
                  disabled={inCorso !== null}
                  onClick={() => chiama(`togli-${v.visita_id}`, "elimina_posto_visita", { p_visita: v.visita_id })}
                >
                  {inCorso === `togli-${v.visita_id}` ? "Tolgo..." : "Togli"}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {prenotate.length === 0 && liberi.length === 0 && (
        <p className="field-note" style={{ marginTop: 12 }}>
          Nessun posto indicato per ora.
        </p>
      )}

      {chiuse.length > 0 && (
        <details className="visite-chiuse">
          <summary>Passate o annullate — {chiuse.length}</summary>
          <ul className="visite-lista">
            {chiuse.map((v) => (
              <li key={v.visita_id}>
                <span>
                  {formattaQuando(v.data_ora)}
                  {v.nome_inquilino ? ` · ${v.nome_inquilino}` : ""}
                </span>
                <span className="field-note" style={{ margin: 0 }}>
                  {v.stato === "rifiutata" ? "Annullata" : v.candidatura_id ? "Passata" : "Non prenotato"}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
