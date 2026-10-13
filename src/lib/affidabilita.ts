export type AffidabilitaInput = {
  verificato: boolean;
  protestato: boolean | null;
  garante: boolean | null;
  fideiussione: boolean | null;
  professione: string | null;
  reddito_mensile: number | null;
  mediaRecensioni: number | null; // null se nessuna recensione ancora
  numeroRecensioni: number;
};

/**
 * Una voce del punteggio: quanto vale oggi e, se manca, quanto varrebbe. Il punteggio si CALCOLA sommando queste voci,
 * quindi ciò che si mostra («+20 per il reddito verificato») e il numero non possono divergere.
 */
export type VoceAffidabilita = {
  id: "base" | "verifica" | "protesti" | "garanzia" | "recensioni";
  etichetta: string;
  /** i punti che la voce dà (o toglie) oggi */
  punti: number;
  /** `mancante`: non ancora ottenuta e ottenibile; `negativa`: toglie punti; `neutra`: la base o una media di 3 */
  stato: "ottenuta" | "mancante" | "negativa" | "neutra";
  /** i punti che si guadagnerebbero completandola (solo se `mancante`, altrimenti 0) */
  potenziale: number;
  /** cosa fare per ottenerla, se c'è qualcosa da fare */
  suggerimento: string | null;
  /** una riga di dettaglio (per le recensioni: la media e quante sono) */
  nota: string | null;
};

export const PUNTI_BASE = 45;
export const PUNTEGGIO_MINIMO = 5;
export const PUNTEGGIO_MASSIMO = 99;

export type AffidabilitaResult = {
  punteggio: number;
  label: "Da costruire" | "Buona" | "Molto buona" | "Eccellente";
  hasRecensioni: boolean;
  checks: { ok: boolean; label: string }[];
  /** da cosa è fatto il punteggio, voce per voce */
  voci: VoceAffidabilita[];
  /** la somma delle voci, prima di tenerla tra il minimo e il massimo */
  totaleGrezzo: number;
  /** se la somma è stata riportata al minimo o al massimo */
  limite: "minimo" | "massimo" | null;
};

export function computeAffidabilita(p: AffidabilitaInput): AffidabilitaResult {
  const hasRecensioni = p.numeroRecensioni > 0;

  const voci: VoceAffidabilita[] = [
    { id: "base", etichetta: "Punto di partenza", punti: PUNTI_BASE, stato: "neutra", potenziale: 0, suggerimento: null, nota: null },
    p.verificato
      ? { id: "verifica", etichetta: "Reddito verificato", punti: 20, stato: "ottenuta", potenziale: 0, suggerimento: null, nota: null }
      : { id: "verifica", etichetta: "Verifica del reddito", punti: 0, stato: "mancante", potenziale: 20, suggerimento: "Verifica il tuo reddito", nota: null },
    p.protestato === false
      ? { id: "protesti", etichetta: "Nessun protesto o segnalazione", punti: 15, stato: "ottenuta", potenziale: 0, suggerimento: null, nota: null }
      : p.protestato === true
        ? { id: "protesti", etichetta: "Segnalazioni in centrale rischi", punti: -30, stato: "negativa", potenziale: 0, suggerimento: null, nota: null }
        : { id: "protesti", etichetta: "Protesti e segnalazioni", punti: 0, stato: "mancante", potenziale: 15, suggerimento: "Indica i protesti nei tuoi dati", nota: null },
    p.garante === true || p.fideiussione === true
      ? { id: "garanzia", etichetta: "Garante o fideiussione", punti: 10, stato: "ottenuta", potenziale: 0, suggerimento: null, nota: null }
      : { id: "garanzia", etichetta: "Garante o fideiussione", punti: 0, stato: "mancante", potenziale: 10, suggerimento: "Indica un garante o una fideiussione nei tuoi dati", nota: null },
  ];

  if (hasRecensioni && p.mediaRecensioni !== null) {
    const punti = Math.round((p.mediaRecensioni - 3) * 6);
    voci.push({
      id: "recensioni",
      etichetta: "Recensioni dei proprietari",
      punti,
      stato: punti > 0 ? "ottenuta" : punti < 0 ? "negativa" : "neutra",
      potenziale: 0,
      suggerimento: null,
      nota: `Media ${p.mediaRecensioni.toLocaleString("it-IT", { maximumFractionDigits: 1 })} su 5, ${p.numeroRecensioni} ${p.numeroRecensioni === 1 ? "recensione" : "recensioni"}`,
    });
  } else {
    // senza recensioni la voce non pesa; con tutte a 5 stelle varrebbe +12
    voci.push({ id: "recensioni", etichetta: "Recensioni dei proprietari", punti: 0, stato: "mancante", potenziale: 12, suggerimento: "Invita il tuo proprietario a lasciarti una recensione", nota: null });
  }

  const totaleGrezzo = voci.reduce((somma, v) => somma + v.punti, 0);
  const punteggio = Math.max(PUNTEGGIO_MINIMO, Math.min(PUNTEGGIO_MASSIMO, Math.round(totaleGrezzo)));
  const limite: AffidabilitaResult["limite"] = totaleGrezzo > PUNTEGGIO_MASSIMO ? "massimo" : totaleGrezzo < PUNTEGGIO_MINIMO ? "minimo" : null;

  let label: AffidabilitaResult["label"] = "Da costruire";
  if (punteggio >= 85) label = "Eccellente";
  else if (punteggio >= 70) label = "Molto buona";
  else if (punteggio >= 50) label = "Buona";

  const checks = [
    {
      ok: !!p.professione,
      label: p.professione || "Situazione lavorativa da indicare",
    },
    {
      ok: !!p.reddito_mensile,
      label: p.reddito_mensile
        ? `Reddito dichiarato €${p.reddito_mensile.toLocaleString("it-IT")}/mese`
        : "Reddito da indicare",
    },
    {
      ok: p.verificato,
      label: p.verificato
        ? "Reddito verificato"
        : "Verifica reddito non ancora effettuata",
    },
    {
      ok: p.protestato === false,
      label:
        p.protestato === null
          ? "Controllo protesti da avviare"
          : p.protestato
            ? "Segnalazioni in centrale rischi"
            : "Nessun protesto o segnalazione",
    },
    {
      ok: p.garante === true || p.fideiussione === true,
      label:
        p.garante || p.fideiussione
          ? "Garante o fideiussione disponibile"
          : "Nessun garante indicato",
    },
  ];

  return { punteggio, label, hasRecensioni, checks, voci, totaleGrezzo, limite };
}

/** Il punteggio che si raggiungerebbe completando tutte le voci mancanti (mai oltre il massimo). */
export function punteggioPossibile(r: Pick<AffidabilitaResult, "voci" | "totaleGrezzo">): number {
  const guadagno = r.voci.reduce((somma, v) => somma + (v.stato === "mancante" ? v.potenziale : 0), 0);
  return Math.max(PUNTEGGIO_MINIMO, Math.min(PUNTEGGIO_MASSIMO, Math.round(r.totaleGrezzo + guadagno)));
}

export type CompletenessInput = {
  hasZone: boolean;
  professione: string | null;
  reddito_mensile: number | null;
  garante: boolean | null;
  animali: boolean | null;
  presentazione: string | null;
  nucleo: string | null;
  fideiussione: boolean | null;
  /** facoltativo: i chiamanti precedenti non lo passano */
  reddito_nucleo?: number | null;
};

export function computeProfileCompleteness(p: CompletenessInput): number {
  const fields = [
    p.hasZone,
    !!p.professione,
    !!p.reddito_mensile,
    !!p.reddito_nucleo,
    p.garante !== null,
    p.animali !== null,
    (p.presentazione ?? "").trim().length > 10,
    p.nucleo !== null,
    p.fideiussione !== null,
  ];
  const filled = fields.filter(Boolean).length;
  return Math.round((filled / fields.length) * 100);
}
