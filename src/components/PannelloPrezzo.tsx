import { classeValida } from "@/lib/annunci/energia";
import {
  AVVISO_DATI_DI_PROVA,
  AVVISO_INDICATIVO,
  SENZA_DATI,
  SENZA_QUOTAZIONE,
  consigliaPrezzo,
  type Fascia,
} from "@/lib/prezzi/consiglio";
import type { RisultatoQuotazione } from "@/lib/prezzi";

const ETICHETTA: Record<Fascia, string> = {
  in_linea: "In linea con la zona",
  sotto: "Sotto la zona",
  sopra: "Sopra la zona",
};

/**
 * Il consiglio sul prezzo, mentre il proprietario sceglie il canone. Si aggiorna da
 * solo con zona, canone, metri quadri e classe energetica. È un'indicazione e lo dice;
 * se i numeri sono di prova lo dice ogni volta. Non salva niente e non cambia il modulo.
 */
export function PannelloPrezzo({
  zona,
  canone,
  mq,
  classe,
  quotazioni,
}: {
  zona: string;
  canone: number;
  mq: number;
  classe: string;
  quotazioni: Record<string, RisultatoQuotazione>;
}) {
  const quotazione = quotazioni[zona] ?? null;

  if (!quotazione) {
    return (
      <p className="field-note" style={{ margin: 0 }} role="status">
        {SENZA_QUOTAZIONE}
      </p>
    );
  }

  const c = consigliaPrezzo({ quotazione, mq, canone, classe: classeValida(classe) ? classe : null });
  if (!c) {
    return (
      <p className="field-note" style={{ margin: 0 }} role="status">
        {SENZA_DATI}
      </p>
    );
  }

  return (
    <div className="pannello-prezzo" role="status" aria-live="polite">
      <div className="note-box" style={{ marginTop: 0 }}>
        <b>{ETICHETTA[c.fascia]}.</b> {c.testo}
      </div>
      <p className="field-note" style={{ margin: "8px 0 0 0" }}>
        {c.dettaglio}
      </p>
      <p className="field-note" style={{ margin: "4px 0 0 0" }}>
        {AVVISO_INDICATIVO}
        {c.provvisorio ? ` ${AVVISO_DATI_DI_PROVA}` : ""}
      </p>
    </div>
  );
}
