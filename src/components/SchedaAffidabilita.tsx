import { punteggioPossibile, PUNTEGGIO_MASSIMO, SOGLIE_ETICHETTA, type AffidabilitaResult } from "@/lib/affidabilita";
import { stelleTesto, testoRecensioni, type RiepilogoRecensioni } from "@/lib/recensioni";

/** I punti di una voce, come si leggono: «+60» se l'hai presa, «0 su 60» se no. */
export function testoPunti(v: { presa: boolean; punti: number; massimo: number }): string {
  return v.presa ? `+${v.punti}` : `0 su ${v.massimo}`;
}

/**
 * Come si calcola il punteggio di affidabilità: tre voci, quanto valgono e chi le controlla. Poi le recensioni, che
 * stanno a parte. Si mostra nella Home e nel Profilo (stessa scheda, stessi numeri: i punti vengono dalla stessa
 * funzione che calcola il punteggio).
 */
export function SchedaAffidabilita({
  affidabilita,
  recensioni,
  onApri,
}: {
  affidabilita: AffidabilitaResult;
  recensioni: RiepilogoRecensioni;
  /** si chiama con la sezione da aprire: la verifica del reddito, o i dati personali */
  onApri?: (sezione: "verifica" | "dati") => void;
}) {
  const { punteggio, label, voci } = affidabilita;
  const possibile = punteggioPossibile(affidabilita);

  return (
    <div className="aff-scheda">
      <p className="sheet-sub">
        È il numero che i proprietari vedono accanto alla tua candidatura. Va da 0 a {PUNTEGGIO_MASSIMO} e si costruisce con tre voci.
        Chi non ha ancora niente parte da 0.
      </p>

      <div className="aff-totale" aria-label={`Punteggio ${punteggio} su ${PUNTEGGIO_MASSIMO}, ${label}`}>
        <b>{punteggio}</b>
        <span>/{PUNTEGGIO_MASSIMO}</span>
        <em>{label}</em>
      </div>

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
              v.sezione &&
              (onApri ? (
                <button type="button" className="redo-link aff-azione" onClick={() => onApri(v.sezione!)}>
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
      <p className="field-note" style={{ marginTop: 8 }}>
        Lo staff controlla solo il reddito. Protesti e garante sono dichiarazioni tue, e restano tali. Da {SOGLIE_ETICHETTA.moltoBuona} punti in su
        l&apos;etichetta è «Molto buona», da {SOGLIE_ETICHETTA.eccellente} «Eccellente».
      </p>

      <div className="pref-label" style={{ marginTop: 16 }}>
        <span>Le recensioni, a parte</span>
      </div>
      <p className="field-note" style={{ margin: "0 0 6px 0" }}>
        Non cambiano il punteggio: i proprietari le vedono accanto. Le lascia un proprietario verificato dopo un affitto confermato, con
        1-5 stelle; qui si mostra la media e quante sono.
      </p>
      <div className="aff-recensioni" aria-label={testoRecensioni(recensioni)}>
        <span aria-hidden="true" className="aff-stelle">
          {stelleTesto(recensioni.media)}
        </span>
        <b>{testoRecensioni(recensioni)}</b>
      </div>
    </div>
  );
}
