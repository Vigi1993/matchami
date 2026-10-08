"use client";

import {
  ETICHETTE_STATO,
  FILTRI_VUOTI,
  LUNGHEZZA_MASSIMA_RICERCA,
  SOGLIE_COMPATIBILITA,
  etichettaMinimo,
  numeroFiltriAttivi,
  riepilogoRicerca,
  type FiltroStato,
  type Filtri,
} from "@/lib/ricerca-candidati";

/**
 * La barra di ricerca e i filtri del Database inquilini. Non decide cosa
 * mostrare (lo fa lib/ricerca-candidati): raccoglie le scelte del
 * proprietario. Ciò che si cerca resta in questa pagina: non si salva e non
 * si invia.
 */
export function RicercaCandidati({
  filtri,
  onCambia,
  annunci,
  conPunteggi,
  visibili,
  totale,
}: {
  filtri: Filtri;
  onCambia: (f: Filtri) => void;
  annunci: { id: string; titolo: string }[];
  /** Se nessun candidato ha una percentuale, il filtro per compatibilità non si offre. */
  conPunteggi: boolean;
  visibili: number;
  totale: number;
}) {
  const attivi = numeroFiltriAttivi(filtri);
  const imposta = (parziale: Partial<Filtri>) => onCambia({ ...filtri, ...parziale });

  return (
    <div className="ricerca-barra" role="search" aria-label="Cerca tra i candidati">
      <input
        type="search"
        className="ricerca-input"
        placeholder="Cerca per nome, lavoro o annuncio"
        aria-label="Cerca tra i candidati"
        value={filtri.testo}
        maxLength={LUNGHEZZA_MASSIMA_RICERCA}
        autoComplete="off"
        onChange={(e) => imposta({ testo: e.target.value })}
      />

      {annunci.length > 1 && (
        <select
          className="ricerca-select"
          aria-label="Annuncio"
          value={filtri.annuncioId ?? ""}
          onChange={(e) => imposta({ annuncioId: e.target.value || null })}
        >
          <option value="">Tutti gli annunci</option>
          {annunci.map((a) => (
            <option key={a.id} value={a.id}>
              {a.titolo}
            </option>
          ))}
        </select>
      )}

      <div className="chip-row" role="group" aria-label="Stato">
        {(Object.keys(ETICHETTE_STATO) as FiltroStato[]).map((s) => (
          <Interruttore key={s} acceso={filtri.stato === s} onClick={() => imposta({ stato: s })}>
            {ETICHETTE_STATO[s]}
          </Interruttore>
        ))}
      </div>

      <div className="chip-row" role="group" aria-label="Filtri">
        <Interruttore acceso={filtri.soloVerificati} onClick={() => imposta({ soloVerificati: !filtri.soloVerificati })}>
          Reddito verificato
        </Interruttore>
        <Interruttore acceso={filtri.senzaBlocchi} onClick={() => imposta({ senzaBlocchi: !filtri.senzaBlocchi })}>
          Senza blocchi
        </Interruttore>
      </div>

      {conPunteggi && (
        <div className="chip-row" role="group" aria-label="Compatibilità">
          {SOGLIE_COMPATIBILITA.map((m) => (
            <Interruttore key={m} acceso={filtri.minimo === m} onClick={() => imposta({ minimo: m })}>
              {etichettaMinimo(m)}
            </Interruttore>
          ))}
        </div>
      )}

      <div className="ricerca-riepilogo" aria-live="polite">
        {attivi > 0 && (
          <>
            <span>{riepilogoRicerca(visibili, totale)}</span>
            <button type="button" className="redo-link" onClick={() => onCambia(FILTRI_VUOTI)}>
              Azzera filtri
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function Interruttore({
  acceso,
  onClick,
  children,
}: {
  acceso: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button type="button" aria-pressed={acceso} className={`chip ${acceso ? "on" : ""}`} onClick={onClick}>
      {children}
    </button>
  );
}
