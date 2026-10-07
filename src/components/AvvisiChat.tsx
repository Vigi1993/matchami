import { IconInfo } from "@/components/icons";
import {
  AVVISO_FISSO,
  CONSIGLIO_FINALE,
  SEGNI_DI_TRUFFA,
  testoAvvisoMessaggio,
  testoConfermaInvio,
  type Rischio,
} from "@/lib/truffe";

/**
 * Gli avvisi contro la truffa dell'affitto nella chat. Sono consigli: non
 * bloccano niente (vedi lib/truffe.ts).
 */

/** Sempre visibile in cima a ogni chat: una riga, e l'elenco dei segni si apre se serve. */
export function AvvisoTruffe() {
  return (
    <details className="chat-avviso">
      <summary>
        <IconInfo className="chat-avviso-icona" />
        <span>
          {AVVISO_FISSO} <span className="chat-avviso-apri">Come riconoscere una truffa</span>
        </span>
      </summary>
      <ul>
        {SEGNI_DI_TRUFFA.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
      <p>{CONSIGLIO_FINALE}</p>
    </details>
  );
}

/** Sotto un messaggio RICEVUTO che parla di soldi in modo sospetto. */
export function AvvisoMessaggio({ rischio }: { rischio: Rischio }) {
  if (rischio.livello === "nessuno") return null;
  return (
    <div className={`chat-rischio ${rischio.livello === "alto" ? "alto" : ""}`} role="note">
      {testoAvvisoMessaggio(rischio)}
    </div>
  );
}

/** Prima di inviare un messaggio che parla di soldi: si può modificare o inviare comunque. */
export function ConfermaInvioRischioso({
  rischio,
  onModifica,
  onInvia,
}: {
  rischio: Rischio;
  onModifica: () => void;
  onInvia: () => void;
}) {
  return (
    <div className="chat-conferma" role="alertdialog" aria-label="Messaggio che parla di soldi">
      <p>{testoConfermaInvio(rischio)}</p>
      <div className="flex gap-3">
        <button type="button" className="btn-danger-outline" style={{ borderColor: "rgba(16,21,26,.14)", color: "var(--ink)" }} onClick={onModifica}>
          Modifica
        </button>
        <button type="button" className="opp-cta" onClick={onInvia}>
          Invia comunque
        </button>
      </div>
    </div>
  );
}
