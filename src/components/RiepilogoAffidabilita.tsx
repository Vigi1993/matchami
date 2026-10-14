import { PUNTEGGIO_MASSIMO, punteggioPossibile, type AffidabilitaResult, type VoceAffidabilita } from "@/lib/affidabilita";
import { stelleTesto, testoRecensioni, type RiepilogoRecensioni } from "@/lib/recensioni";

/** I punti di una voce, come si leggono: «+60» se l'hai presa, «0 su 60» se no. */
export function testoPunti(v: { presa: boolean; punti: number; massimo: number }): string {
  return v.presa ? `+${v.punti}` : `0 su ${v.massimo}`;
}

/** A quale parte della scheda «I tuoi dati» porta il suggerimento di ogni voce. */
export const ANCORE_VOCI: Record<VoceAffidabilita["id"], string> = {
  reddito: "dati-verifica",
  protesti: "dati-protesti",
  garanzia: "dati-garante",
};

/**
 * Il punteggio in cima alla scheda «I tuoi dati»: il numero, il link a «come viene calcolato», le tre voci (quanto
 * valgono, chi le controlla, cosa manca) e le recensioni, che stanno a parte. Non spiega le regole: lo fa la scheda
 * «Come viene calcolato».
 */
export function RiepilogoAffidabilita({
  affidabilita,
  recensioni,
  onCome,
  onVai,
}: {
  affidabilita: AffidabilitaResult;
  recensioni: RiepilogoRecensioni;
  /** apre l'informativa su come viene calcolato il punteggio */
  onCome: () => void;
  /** scorre alla parte della scheda dove si completa una voce (l'id dell'ancora) */
  onVai?: (ancora: string) => void;
}) {
  const { punteggio, label, voci } = affidabilita;
  const possibile = punteggioPossibile(affidabilita);

  return (
    <div className="aff-riepilogo">
      <div className="aff-totale" aria-label={`Punteggio ${punteggio} su ${PUNTEGGIO_MASSIMO}, ${label}`}>
        <b>{punteggio}</b>
        <span>/{PUNTEGGIO_MASSIMO}</span>
        <em>{label}</em>
      </div>
      <button type="button" className="redo-link aff-come" onClick={onCome}>
        Come viene calcolato il punteggio ›
      </button>

      <ul className="aff-voci">
        {voci.map((v) => (
          <li key={v.id} className={`aff-voce ${v.presa ? "is-presa" : "is-non-presa"}`}>
            <div className="aff-voce-riga">
              <span>{v.etichetta}</span>
              <b className="aff-punti">{testoPunti(v)}</b>
            </div>
            <span className={`aff-origine is-${v.origine}`}>{v.origine === "verificato" ? "Lo controlla lo staff" : "Lo dichiari tu"}</span>
            <small>{v.nota}</small>
            {!v.presa &&
              v.suggerimento &&
              (onVai ? (
                <button type="button" className="redo-link aff-azione" onClick={() => onVai(ANCORE_VOCI[v.id])}>
                  {v.suggerimento}
                </button>
              ) : (
                <small>{v.suggerimento}</small>
              ))}
          </li>
        ))}
      </ul>
      {possibile > punteggio && (
        <p className="aff-possibile">
          Completando le voci che puoi ottenere arrivi a <b>{possibile}</b>.
        </p>
      )}

      <div className="aff-recensioni" aria-label={`Recensioni: ${testoRecensioni(recensioni)}`}>
        <span aria-hidden="true" className="aff-stelle">
          {stelleTesto(recensioni.media)}
        </span>
        <span>
          <b>{testoRecensioni(recensioni)}</b>
          <small>Le recensioni stanno a parte: non cambiano il punteggio.</small>
        </span>
      </div>
    </div>
  );
}
