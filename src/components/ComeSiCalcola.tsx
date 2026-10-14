import { esempiAffidabilita, fasceAffidabilita, PUNTEGGIO_MASSIMO, PUNTI_AFFIDABILITA } from "@/lib/affidabilita";

/**
 * L'informativa su come viene calcolato il punteggio di affidabilità: solo spiegazione, nessun dato personale e nessuna
 * azione. Ogni numero viene dalle regole del calcolo (costanti e funzioni di affidabilita.ts): l'informativa non può
 * dire una cosa diversa dalla formula.
 */
export function ComeSiCalcola() {
  const fasce = fasceAffidabilita();
  const esempi = esempiAffidabilita();

  return (
    <div className="come-scheda">
      <p className="sheet-sub">
        L&apos;affidabilità è un numero da 0 a {PUNTEGGIO_MASSIMO} che i proprietari vedono accanto alla tua candidatura. Si costruisce con tre
        voci; chi non ha ancora niente parte da 0. Non entra nella percentuale di compatibilità con la casa: nell&apos;elenco dei candidati
        conta solo a parità di compatibilità.
      </p>

      <div className="pref-label">
        <span>Le tre voci</span>
      </div>
      <ul className="come-voci">
        <li>
          <div className="aff-voce-riga">
            <span>Reddito verificato</span>
            <b className="aff-punti">+{PUNTI_AFFIDABILITA.reddito}</b>
          </div>
          <small>
            Lo controlla lo staff, su un documento d&apos;identità e una prova del reddito. Se cambi lavoro o reddito la verifica decade e va rifatta.
          </small>
        </li>
        <li>
          <div className="aff-voce-riga">
            <span>Nessun protesto</span>
            <b className="aff-punti">+{PUNTI_AFFIDABILITA.protesti}</b>
          </div>
          <small>
            Lo dichiari tu e nessuno lo controlla. Se dichiari dei protesti o non rispondi, la voce non dà punti.
          </small>
        </li>
        <li>
          <div className="aff-voce-riga">
            <span>Garante o fideiussione</span>
            <b className="aff-punti">+{PUNTI_AFFIDABILITA.garanzia}</b>
          </div>
          <small>Lo dichiari tu e nessuno lo controlla. Basta una delle due: non si sommano.</small>
        </li>
      </ul>

      <div className="pref-label" style={{ marginTop: 16 }}>
        <span>Le fasce</span>
      </div>
      <ul className="come-fasce">
        {fasce.map((f) => (
          <li key={f.label}>
            <span>{f.label}</span>
            <b>
              {f.da}–{f.a}
            </b>
          </li>
        ))}
      </ul>

      <div className="pref-label" style={{ marginTop: 16 }}>
        <span>Qualche esempio</span>
      </div>
      <ul className="come-fasce">
        {esempi.map((e) => (
          <li key={e.descrizione}>
            <span>{e.descrizione}</span>
            <b>
              {e.punteggio} · {e.label}
            </b>
          </li>
        ))}
      </ul>
      <p className="field-note" style={{ marginTop: 8 }}>
        Il reddito verificato pesa più delle dichiarazioni: con le sole dichiarazioni non si arriva mai oltre la fascia «Buona».
      </p>

      <div className="pref-label" style={{ marginTop: 16 }}>
        <span>Le recensioni, a parte</span>
      </div>
      <p className="field-note" style={{ margin: 0 }}>
        Le recensioni non fanno parte del punteggio. Le lascia un proprietario verificato dopo un affitto confermato, con da 1 a 5 stelle.
        Accanto al punteggio si vede la media e quante sono, perché una sola recensione non pesa come dieci.
      </p>
    </div>
  );
}
