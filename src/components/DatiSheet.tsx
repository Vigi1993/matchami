"use client";

import { useEffect, useRef, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { DatiForm } from "@/components/DatiForm";
import { RiepilogoAffidabilita } from "@/components/RiepilogoAffidabilita";
import { ComeSiCalcola } from "@/components/ComeSiCalcola";
import type { AffidabilitaResult } from "@/lib/affidabilita";
import type { RiepilogoRecensioni } from "@/lib/recensioni";
import type { TenantProfile } from "@/lib/types";

/**
 * La scheda «I tuoi dati»: in alto il punteggio di affidabilità (con il link a «come viene calcolato»), poi i dati da
 * modificare e la verifica del reddito. Sulla Home e nel Profilo è la stessa.
 *
 * Il link «come viene calcolato» mostra, nella stessa scheda, l'informativa al posto dei dati: i dati restano in
 * memoria (nascosti, non smontati), quindi tornando indietro non si perde ciò che si stava scrivendo.
 */
export function DatiSheet({
  open,
  onClose,
  tenant,
  affidabilita,
  recensioni,
  verificaPanel,
  onSalvata,
  scorriA = null,
}: {
  open: boolean;
  onClose: () => void;
  tenant: TenantProfile;
  affidabilita: AffidabilitaResult;
  recensioni: RiepilogoRecensioni;
  /** il pannello per verificare il reddito con i documenti, costruito dal server */
  verificaPanel: React.ReactNode;
  /** chiamata quando i dati vengono salvati (la Home chiude la scheda e lo dice) */
  onSalvata?: () => void;
  /** all'apertura scorre a questa parte (da un collegamento che porta alla verifica del reddito) */
  scorriA?: "verifica" | null;
}) {
  const [vista, setVista] = useState<"dati" | "come">("dati");
  const radice = useRef<HTMLDivElement>(null);
  const posizione = useRef(0);

  const contenitore = () => radice.current?.closest(".sheet-scroll") as HTMLElement | null;

  // dall'informativa si torna ai dati dove si era rimasti
  useEffect(() => {
    const c = contenitore();
    if (!c) return;
    if (vista === "come") {
      posizione.current = c.scrollTop;
      c.scrollTop = 0;
    } else {
      c.scrollTop = posizione.current;
    }
  }, [vista]);

  // un collegamento alla verifica del reddito porta direttamente lì
  useEffect(() => {
    if (open && scorriA === "verifica") {
      const t = setTimeout(() => vai("dati-verifica"), 60);
      return () => clearTimeout(t);
    }
  }, [open, scorriA]);

  function vai(ancora: string) {
    document.getElementById(ancora)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const inInformativa = vista === "come";
  // chiusa la scheda, la prossima apertura riparte dai dati (si azzera qui, non in un effetto)
  const chiudi = () => {
    setVista("dati");
    onClose();
  };

  return (
    <Sheet open={open} onClose={inInformativa ? () => setVista("dati") : chiudi} title={inInformativa ? "Come viene calcolato" : "I tuoi dati"}>
      <div ref={radice}>
        {inInformativa && (
          <>
            <button type="button" className="redo-link aff-indietro" onClick={() => setVista("dati")}>
              ‹ Torna ai tuoi dati
            </button>
            <ComeSiCalcola />
          </>
        )}
        {/* nascosto, non smontato: così i dati scritti a metà restano */}
        <div hidden={inInformativa}>
          <RiepilogoAffidabilita affidabilita={affidabilita} recensioni={recensioni} onCome={() => setVista("come")} onVai={vai} />

          <div className="pref-label" style={{ marginTop: 18 }}>
            <span>Modifica i tuoi dati</span>
          </div>
          <DatiForm tenant={tenant} onSalvata={onSalvata} />

          <div id="dati-verifica" className="ancora-dati" />
          <div className="pref-label" style={{ marginTop: 22 }}>
            <span>Verifica del reddito</span>
          </div>
          <p className="sheet-sub">
            Carica un documento d&apos;identità e una prova del reddito. Se li confermiamo, i proprietari vedono «Reddito verificato» e il tuo
            punteggio di affidabilità sale.
          </p>
          {verificaPanel}
        </div>
      </div>
    </Sheet>
  );
}
