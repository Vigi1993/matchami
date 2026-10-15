import { esempiAffidabilita, fasceAffidabilita, PUNTEGGIO_MASSIMO, PUNTI_AFFIDABILITA } from "@/lib/affidabilita";
import { ANNI_VALIDITA, AUTORI_DIVERSI_MINIMI, NOME_BADGE_RACCOMANDATO, VOTO_NEGATIVO_MASSIMO, VOTO_POSITIVO_MINIMO } from "@/lib/recensioni";

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
        L&apos;affidabilità è un numero da 0 a {PUNTEGGIO_MASSIMO} che i proprietari vedono accanto alla tua candidatura. Si costruisce con tre voci: due danno punti,
        i protesti li tolgono. Non scende sotto 0. Non entra nella percentuale di compatibilità con la casa: nell&apos;elenco dei candidati
        conta solo a parità di compatibilità: prima passa chi ha il badge «{NOME_BADGE_RACCOMANDATO}», poi chi ha l&apos;affidabilità più alta.
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
            <span>Protesti</span>
            <b className="aff-punti">
              +{PUNTI_AFFIDABILITA.protesti} o −{PUNTI_AFFIDABILITA.protesti}
            </b>
          </div>
          <small>
            Lo dichiari tu e nessuno lo controlla. «Nessun protesto» dà {PUNTI_AFFIDABILITA.protesti} punti; se dichiari dei protesti, o non rispondi, ne toglie{" "}
            {PUNTI_AFFIDABILITA.protesti}: «non indicato» vale come «sì». La domanda è obbligatoria.
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
      <p className="field-note" style={{ margin: "6px 0 0 0" }}>
        Finché non rispondi alla domanda sui protesti, al posto della fascia vedi «Da completare»: il punteggio intanto conta i protesti.
      </p>

      <div className="pref-label" style={{ marginTop: 16 }}>
        <span>Tutti i casi</span>
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
        Conta di più ciò che si verifica (il reddito) di ciò che si dichiara. Con le sole dichiarazioni non si va oltre «Buona». Con dei protesti si arriva a
        «Buona» solo con reddito verificato e garante.
      </p>

      <div className="pref-label" style={{ marginTop: 16 }}>
        <span>Le recensioni, a parte</span>
      </div>
      <p className="field-note" style={{ margin: 0 }}>
        Le recensioni non fanno parte del punteggio. Le lascia un proprietario verificato dopo un affitto confermato, con da 1 a 5 stelle.
        Accanto al punteggio si vede la media e quante sono, perché una sola recensione non pesa come dieci.
      </p>

      <div className="pref-label" style={{ marginTop: 16 }}>
        <span>{NOME_BADGE_RACCOMANDATO}</span>
      </div>
      <p className="field-note" style={{ margin: "0 0 6px 0" }}>
        È un badge, non un punteggio: non cambia il numero da 0 a {PUNTEGGIO_MASSIMO}. Si ottiene con almeno {AUTORI_DIVERSI_MINIMI} recensioni positive (da{" "}
        {VOTO_POSITIVO_MINIMO} stelle in su) di {AUTORI_DIVERSI_MINIMI} proprietari diversi.
      </p>
      <ul className="come-regole">
        <li>Due recensioni dello stesso proprietario valgono una sola.</li>
        <li>Una recensione da 3 stelle non conta per ottenerlo, ma non lo toglie.</li>
        <li>
          Basta una recensione negativa (da {VOTO_NEGATIVO_MASSIMO} stelle in giù) per non averlo, o per perderlo. Contano solo le recensioni degli ultimi{" "}
          {ANNI_VALIDITA} anni: col tempo il badge va rinnovato.
        </li>
      </ul>
      <p className="field-note" style={{ margin: "6px 0 0 0" }}>
        Cosa cambia: i proprietari vedono il badge sulla tua candidatura, possono cercare solo gli «Inquilini raccomandati» e, a parità di compatibilità, chi
        ce l&apos;ha compare prima. Per avere delle recensioni, dichiara un affitto o invita il tuo proprietario da «Gestione affitto».
      </p>
    </div>
  );
}
