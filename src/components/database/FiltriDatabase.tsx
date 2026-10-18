"use client";

import { SOGLIE_COMPATIBILITA, etichettaMinimo } from "@/lib/ricerca-candidati";
import { FILTRI_ELENCO_VUOTI, ceFiltriAttivi, type FiltriElenco } from "@/lib/database-elenco";

/**
 * I filtri oltre alla ricerca e alle schede: reddito verificato, inquilini raccomandati, senza blocchi, compatibilità minima. Non decide cosa
 * mostrare (lo fa lib/database-elenco): raccoglie le scelte. Ciò che si sceglie resta in questa pagina: non si salva e non si invia.
 */
export function FiltriDatabase({
  id,
  filtri,
  onCambia,
  conPunteggi,
  visibili,
  totale,
}: {
  id: string;
  filtri: FiltriElenco;
  onCambia: (f: FiltriElenco) => void;
  /** Se nessuno ha una percentuale, il filtro per compatibilità non si offre: accenderlo nasconderebbe tutti. */
  conPunteggi: boolean;
  visibili: number;
  totale: number;
}) {
  const imposta = (parziale: Partial<FiltriElenco>) => onCambia({ ...filtri, ...parziale });
  return (
    <div id={id} className="db-filtri">
      <div className="chip-row" role="group" aria-label="Filtri">
        <Interruttore acceso={filtri.soloVerificati} onClick={() => imposta({ soloVerificati: !filtri.soloVerificati })}>
          Reddito verificato
        </Interruttore>
        <Interruttore acceso={filtri.soloRaccomandati} onClick={() => imposta({ soloRaccomandati: !filtri.soloRaccomandati })}>
          Inquilini raccomandati
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

      <div className="db-filtri-riepilogo" aria-live="polite">
        {ceFiltriAttivi(filtri) && (
          <>
            <span>
              {visibili} {visibili === 1 ? "persona" : "persone"} su {totale}
            </span>
            <button type="button" className="redo-link" onClick={() => onCambia({ ...FILTRI_ELENCO_VUOTI })}>
              Azzera filtri
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function Interruttore({ acceso, onClick, children }: { acceso: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-pressed={acceso} className={`chip ${acceso ? "on" : ""}`} onClick={onClick}>
      {children}
    </button>
  );
}
