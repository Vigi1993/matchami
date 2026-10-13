import { PUNTEGGIO_MASSIMO, PUNTEGGIO_MINIMO, PUNTI_BASE, punteggioPossibile, type AffidabilitaResult, type VoceAffidabilita } from "@/lib/affidabilita";
import { sezionePerVoce, type SezioneProfilo } from "@/lib/home";

/** I punti di una voce, come si leggono: «+20», «−30», «45», o «+20 possibili» se manca. */
export function testoPunti(v: VoceAffidabilita): string {
  if (v.stato === "mancante") return `+${v.potenziale} possibili`;
  if (v.id === "base") return String(v.punti);
  if (v.punti > 0) return `+${v.punti}`;
  if (v.punti < 0) return `\u2212${Math.abs(v.punti)}`;
  return "0";
}

/**
 * Da cosa è fatto il punteggio di affidabilità, voce per voce. Si mostra nella Home e nel Profilo (stessa scheda,
 * stessi numeri: i punti vengono dalla stessa funzione che calcola il punteggio).
 */
export function SchedaAffidabilita({ affidabilita, onApri }: { affidabilita: AffidabilitaResult; onApri?: (sezione: SezioneProfilo) => void }) {
  const { punteggio, label, voci, limite, totaleGrezzo, checks } = affidabilita;
  const possibile = punteggioPossibile(affidabilita);
  // professione e reddito dichiarato sono i primi due controlli: si vedono, ma non entrano nel punteggio
  const datiIndicati = checks.slice(0, 2);

  return (
    <div className="aff-scheda">
      <p className="sheet-sub">
        È il numero che i proprietari vedono quando valutano una tua candidatura. Parte da {PUNTI_BASE} e cresce con le verifiche.
      </p>

      <div className="aff-totale" aria-label={`Punteggio ${punteggio} su 100, ${label}`}>
        <b>{punteggio}</b>
        <span>/100</span>
        <em>{label}</em>
      </div>

      <ul className="aff-voci">
        {voci.map((v) => (
          <li key={v.id} className={`aff-voce is-${v.stato}`}>
            <div className="aff-voce-riga">
              <span>{v.etichetta}</span>
              <b className="aff-punti">{testoPunti(v)}</b>
            </div>
            {v.nota && <small>{v.nota}</small>}
            {v.stato === "mancante" && v.suggerimento &&
              (onApri ? (
                <button type="button" className="redo-link aff-azione" onClick={() => onApri(sezionePerVoce(v.id))}>
                  {v.suggerimento}
                </button>
              ) : (
                <small>{v.suggerimento}</small>
              ))}
          </li>
        ))}
      </ul>

      {limite && (
        <p className="field-note">
          La somma delle voci è {totaleGrezzo}: il punteggio va da {PUNTEGGIO_MINIMO} a {PUNTEGGIO_MASSIMO}.
        </p>
      )}
      {possibile > punteggio && (
        <p className="aff-possibile">
          Completando le voci mancanti puoi arrivare a <b>{possibile}</b>.
        </p>
      )}

      <div className="pref-label" style={{ marginTop: 14 }}>
        <span>Dati che indichi</span>
      </div>
      <p className="field-note" style={{ margin: "0 0 6px 0" }}>
        Non cambiano il punteggio.
      </p>
      <div className="match-checklist">
        {datiIndicati.map((c) => (
          <span key={c.label} className={c.ok ? "ok" : "no"}>
            {c.label}
          </span>
        ))}
      </div>
    </div>
  );
}
