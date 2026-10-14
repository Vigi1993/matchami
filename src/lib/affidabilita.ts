/**
 * Il punteggio di affidabilità: da 0 a 100, tre voci, nessun numero negativo.
 *
 *  - REDDITO VERIFICATO  +60  lo controlla lo staff sui documenti
 *  - NESSUN PROTESTO     +25  lo dichiara la persona (non si verifica)
 *  - GARANTE o FIDEIUSSIONE  +15  lo dichiara la persona (non si verifica)
 *
 * Chi non ha niente ha 0. «Protestato» e «non indicato» valgono lo stesso: niente punti. Le RECENSIONI non fanno
 * parte del punteggio: si mostrano a parte, accanto (vedi recensioni.ts).
 */
export type AffidabilitaInput = {
  verificato: boolean;
  protestato: boolean | null;
  garante: boolean | null;
  fideiussione: boolean | null;
};

export const PUNTI_AFFIDABILITA = { reddito: 60, protesti: 25, garanzia: 15 } as const;
export const PUNTEGGIO_MINIMO = 0;
export const PUNTEGGIO_MASSIMO = PUNTI_AFFIDABILITA.reddito + PUNTI_AFFIDABILITA.protesti + PUNTI_AFFIDABILITA.garanzia;

/**
 * Da quale punteggio in su vale ogni etichetta. Con queste soglie le sole dichiarazioni (al massimo 40) non arrivano
 * mai a «Molto buona»: ci vuole il reddito verificato.
 */
export const SOGLIE_ETICHETTA = { buona: 40, moltoBuona: 60, eccellente: 85 } as const;

/** Una voce del punteggio: quanto vale, se l'hai presa, e come si sa (verificata dallo staff o dichiarata da te). */
export type VoceAffidabilita = {
  id: "reddito" | "protesti" | "garanzia";
  etichetta: string;
  /** i punti che dà oggi (0 se non è presa) */
  punti: number;
  /** quanto vale al massimo */
  massimo: number;
  presa: boolean;
  /** `verificato`: lo ha controllato lo staff; `dichiarato`: lo dici tu e nessuno lo controlla */
  origine: "verificato" | "dichiarato";
  /** i punti che guadagneresti completandola (0 se è presa, o se non si può ottenere: i protesti dichiarati) */
  potenziale: number;
  /** cosa fare per ottenerla, se c'è qualcosa da fare */
  suggerimento: string | null;
  /** dove si fa: la verifica del reddito, oppure la scheda dei dati personali */
  sezione: "verifica" | "dati" | null;
  /** una riga sulla situazione */
  nota: string;
};

export type AffidabilitaResult = {
  punteggio: number;
  label: "Da costruire" | "Buona" | "Molto buona" | "Eccellente";
  /** le tre voci, sempre nello stesso ordine */
  voci: VoceAffidabilita[];
};

export function etichettaPunteggio(punteggio: number): AffidabilitaResult["label"] {
  if (punteggio >= SOGLIE_ETICHETTA.eccellente) return "Eccellente";
  if (punteggio >= SOGLIE_ETICHETTA.moltoBuona) return "Molto buona";
  if (punteggio >= SOGLIE_ETICHETTA.buona) return "Buona";
  return "Da costruire";
}

/** Le fasce di punteggio, con gli estremi: ricavate dalle soglie, così l'informativa non può contraddire la formula. */
export function fasceAffidabilita(): { label: AffidabilitaResult["label"]; da: number; a: number }[] {
  const { buona, moltoBuona, eccellente } = SOGLIE_ETICHETTA;
  return [
    { label: "Da costruire", da: PUNTEGGIO_MINIMO, a: buona - 1 },
    { label: "Buona", da: buona, a: moltoBuona - 1 },
    { label: "Molto buona", da: moltoBuona, a: eccellente - 1 },
    { label: "Eccellente", da: eccellente, a: PUNTEGGIO_MASSIMO },
  ];
}

/** Qualche caso tipico, con il punteggio che dà e l'etichetta (anche questi ricavati dalle regole). */
export function esempiAffidabilita(): { descrizione: string; punteggio: number; label: AffidabilitaResult["label"] }[] {
  const casi: [string, AffidabilitaInput][] = [
    ["Nessun dato", { verificato: false, protestato: null, garante: null, fideiussione: null }],
    ["Solo le dichiarazioni (nessun protesto, garante)", { verificato: false, protestato: false, garante: true, fideiussione: null }],
    ["Solo il reddito verificato", { verificato: true, protestato: null, garante: null, fideiussione: null }],
    ["Reddito verificato e nessun protesto", { verificato: true, protestato: false, garante: null, fideiussione: null }],
    ["Tutto", { verificato: true, protestato: false, garante: true, fideiussione: null }],
  ];
  return casi.map(([descrizione, input]) => {
    const r = computeAffidabilita(input);
    return { descrizione, punteggio: r.punteggio, label: r.label };
  });
}

export function computeAffidabilita(p: AffidabilitaInput): AffidabilitaResult {
  const { reddito, protesti, garanzia } = PUNTI_AFFIDABILITA;

  const voceReddito: VoceAffidabilita = p.verificato
    ? { id: "reddito", etichetta: "Reddito verificato", punti: reddito, massimo: reddito, presa: true, origine: "verificato", potenziale: 0, suggerimento: null, sezione: null, nota: "Controllato dallo staff sui tuoi documenti." }
    : { id: "reddito", etichetta: "Reddito verificato", punti: 0, massimo: reddito, presa: false, origine: "verificato", potenziale: reddito, suggerimento: "Verifica il tuo reddito", sezione: "verifica", nota: "Non ancora verificato: carica i documenti e lo controlla lo staff." };

  const voceProtesti: VoceAffidabilita =
    p.protestato === false
      ? { id: "protesti", etichetta: "Nessun protesto", punti: protesti, massimo: protesti, presa: true, origine: "dichiarato", potenziale: 0, suggerimento: null, sezione: null, nota: "Nessuno lo controlla: vale quanto hai dichiarato." }
      : p.protestato === true
        ? { id: "protesti", etichetta: "Nessun protesto", punti: 0, massimo: protesti, presa: false, origine: "dichiarato", potenziale: 0, suggerimento: null, sezione: null, nota: "Hai dichiarato dei protesti o segnalazioni: non danno punti." }
        : { id: "protesti", etichetta: "Nessun protesto", punti: 0, massimo: protesti, presa: false, origine: "dichiarato", potenziale: protesti, suggerimento: "Indica i protesti nei tuoi dati", sezione: "dati", nota: "Non indicato: vale come se ci fossero." };

  const haGaranzia = p.garante === true || p.fideiussione === true;
  const voceGaranzia: VoceAffidabilita = haGaranzia
    ? { id: "garanzia", etichetta: "Garante o fideiussione", punti: garanzia, massimo: garanzia, presa: true, origine: "dichiarato", potenziale: 0, suggerimento: null, sezione: null, nota: "Nessuno lo controlla: vale quanto hai dichiarato." }
    : { id: "garanzia", etichetta: "Garante o fideiussione", punti: 0, massimo: garanzia, presa: false, origine: "dichiarato", potenziale: garanzia, suggerimento: "Indica un garante o una fideiussione", sezione: "dati", nota: "Non indicato." };

  const voci = [voceReddito, voceProtesti, voceGaranzia];
  const punteggio = voci.reduce((somma, v) => somma + v.punti, 0);
  return { punteggio, label: etichettaPunteggio(punteggio), voci };
}

/** Il punteggio che si raggiungerebbe completando tutte le voci ottenibili. */
export function punteggioPossibile(r: Pick<AffidabilitaResult, "voci" | "punteggio">): number {
  return Math.min(PUNTEGGIO_MASSIMO, r.punteggio + r.voci.reduce((somma, v) => somma + v.potenziale, 0));
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
