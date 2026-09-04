"use client";

import { Sheet } from "@/components/Sheet";

const FAQ = [
  {
    q: "Bonus giovani per l'affitto",
    a: "Diverse misure nazionali e regionali prevedono agevolazioni per chi ha meno di 31 anni e affitta un immobile lontano dalla residenza dei genitori. Requisiti e importi cambiano spesso: verifica sul sito dell'Agenzia delle Entrate o del tuo Comune quali sono attive quest'anno.",
  },
  {
    q: "Detrazioni 730 per l'affitto",
    a: "Chi vive in affitto come abitazione principale può avere diritto a una detrazione IRPEF, con importi diversi in base al reddito e al tipo di contratto (libero, concordato, giovani under 31). Il commercialista o il CAF che ti segue può calcolare l'importo esatto in base alla tua situazione.",
  },
  {
    q: "Contributi comunali per l'affitto",
    a: "Molti Comuni, incluso il Comune di Milano, pubblicano periodicamente bandi di sostegno all'affitto per chi rientra in determinate fasce ISEE. Le finestre di apertura cambiano ogni anno: conviene controllare direttamente sul sito del proprio Comune.",
  },
  {
    q: "Cos'è la fideiussione bancaria/assicurativa",
    a: "È una garanzia che una banca o un'assicurazione offre al posto (o in aggiunta) al deposito cauzionale: se l'inquilino non paga, interviene l'ente garante. Va attivata con un intermediario finanziario, non è ancora un servizio diretto di MatchAmI.",
  },
  {
    q: "Come funziona il voto di affidabilità",
    a: "Combina le recensioni ricevute nei contratti conclusi su MatchAmI con le verifiche sul tuo stato economico (reddito dichiarato, eventuale verifica, garante, assenza di protesti). Più informazioni fornisci e più solida è la tua storia, più il punteggio sale.",
  },
];

export function FaqSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="FAQ e bonus affitto">
      <div className="flex flex-col gap-5">
        {FAQ.map((item) => (
          <div key={item.q}>
            <div className="font-display font-bold text-sm text-ink mb-1">
              {item.q}
            </div>
            <p className="text-xs text-ink/60 leading-relaxed">{item.a}</p>
          </div>
        ))}
        <p className="text-[11px] text-ink/40 leading-relaxed border-t border-ink/10 pt-4">
          Informazioni a scopo indicativo: requisiti e importi di bonus,
          detrazioni e contributi possono cambiare nel tempo. Per la tua
          situazione specifica verifica sempre le fonti ufficiali (Agenzia
          delle Entrate, Comune) o parla con un commercialista/CAF.
        </p>
      </div>
    </Sheet>
  );
}
