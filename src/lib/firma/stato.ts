/**
 * Cosa mostrare della firma di un contratto. Logica pura, senza database né rete.
 *
 * Una firma è «valida» se l'impronta registrata è quella del documento di OGGI: se i dati sono cambiati dopo la
 * firma (un canone, una data, un nome) è «superata» e va rifatta. Una firma di PROVA non rende mai il contratto
 * «firmato»: il testo lo dice ogni volta.
 */
import type { FirmaContratto } from "./tipi";

export type RuoloFirma = "locatore" | "conduttore";

export const ETICHETTA_RUOLO: Record<RuoloFirma, string> = { locatore: "Proprietario", conduttore: "Inquilino" };

export type RigaFirma = {
  ruolo: RuoloFirma;
  etichetta: string;
  /** ha firmato (di prova) */
  firmata: boolean;
  /** la firma è sulla versione attuale del documento; `null` se non si sa */
  valida: boolean | null;
  mia: boolean;
  quando: string | null;
  testo: string;
};

export type RiepilogoFirme = {
  righe: [RigaFirma, RigaFirma];
  /** io posso firmare (o rifirmare) adesso */
  puoFirmare: boolean;
  /** ho una mia firma da ritirare */
  haUnaFirmaMia: boolean;
  /** il motivo per cui non posso firmare, se c'è una cosa da dire */
  motivo: string | null;
  /** entrambe le parti hanno una firma di prova sulla versione attuale */
  entrambeValide: boolean;
  /** la frase di sintesi */
  sintesi: string;
};

export const TESTO_NESSUN_VALORE =
  "È una firma di prova: non ha valore legale e non rende il contratto «firmato».";

const data = (iso: string) => new Date(iso).toLocaleDateString("it-IT", { timeZone: "Europe/Rome", day: "numeric", month: "long", year: "numeric" });

export function riepilogoFirme(input: {
  statoContratto: string;
  firme: readonly FirmaContratto[];
  /** l'impronta del documento di oggi; `null` se non si è riusciti a calcolarla */
  improntaAttuale: string | null;
}): RiepilogoFirme {
  const ruoli: RuoloFirma[] = ["locatore", "conduttore"];

  const righe = ruoli.map((ruolo): RigaFirma => {
    const f = input.firme.find((x) => x.ruolo === ruolo);
    if (!f) return { ruolo, etichetta: ETICHETTA_RUOLO[ruolo], firmata: false, valida: null, mia: false, quando: null, testo: "Non ha ancora firmato" };
    const valida = input.improntaAttuale === null ? null : f.impronta === input.improntaAttuale;
    const quando = data(f.firmata_at);
    const testo = valida === false ? `Firma di prova del ${quando}, SUPERATA: il contratto è cambiato dopo la firma` : `Firma di prova del ${quando}`;
    return { ruolo, etichetta: ETICHETTA_RUOLO[ruolo], firmata: true, valida, mia: f.mia, quando: f.firmata_at, testo };
  }) as [RigaFirma, RigaFirma];

  const mia = righe.find((r) => r.mia) ?? null;
  const haUnaFirmaMia = mia !== null;
  const miaValida = mia !== null && mia.valida === true;
  const inFirma = input.statoContratto === "in_firma";

  let motivo: string | null = null;
  if (!inFirma) {
    motivo =
      input.statoContratto === "bozza"
        ? "La firma si apre quando il contratto è «in firma»."
        : "Il contratto non è più «in firma»: la firma di prova non serve.";
  }
  const puoFirmare = inFirma && !miaValida;
  if (inFirma && miaValida) motivo = "Hai già firmato questa versione.";

  const entrambeValide = righe.every((r) => r.firmata && r.valida === true);
  const nSuperate = righe.filter((r) => r.firmata && r.valida === false).length;
  const nFirmate = righe.filter((r) => r.firmata).length;

  const sintesi = entrambeValide
    ? "Entrambe le parti hanno firmato di prova questa versione. Il contratto NON risulta firmato: serve una firma vera."
    : nSuperate > 0
      ? "Il contratto è cambiato dopo una firma di prova: va rifatta."
      : nFirmate === 0
        ? "Nessuna firma di prova ancora."
        : "Manca la firma di prova di una delle due parti.";

  return { righe, puoFirmare, haUnaFirmaMia, motivo, entrambeValide, sintesi };
}
