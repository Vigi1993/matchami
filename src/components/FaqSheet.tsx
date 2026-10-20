"use client";

import { Sheet } from "@/components/Sheet";
import { domandeFrequenti, type Ruolo } from "@/lib/guida-testi";

/**
 * Le domande frequenti, per ruolo. Le risposte su match, affidabilità e recensioni vengono da lib/guida-testi.ts (stesse costanti del calcolo); quelle su
 * bonus e detrazioni sono solo per l'inquilino. «Come funziona» (dal Profilo) è la versione lunga delle stesse cose.
 */
export function FaqSheet({ open, onClose, ruolo = "inquilino" }: { open: boolean; onClose: () => void; ruolo?: Ruolo }) {
  return (
    <Sheet open={open} onClose={onClose} title={ruolo === "inquilino" ? "FAQ e bonus affitto" : "Domande frequenti"}>
      <div>
        {domandeFrequenti(ruolo).map((item) => (
          <div key={item.q} className="faq-item">
            <div className="faq-q">{item.q}</div>
            <p className="faq-a">{item.a}</p>
          </div>
        ))}
        {ruolo === "inquilino" && (
          <p className="field-note" style={{ marginTop: 18, lineHeight: 1.6 }}>
            Informazioni a scopo indicativo: requisiti e importi di bonus, detrazioni e contributi possono cambiare nel tempo. Per la tua situazione specifica
            verifica sempre le fonti ufficiali (Agenzia delle Entrate, Comune) o parla con un commercialista/CAF.
          </p>
        )}
      </div>
    </Sheet>
  );
}
