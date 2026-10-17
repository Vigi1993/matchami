/**
 * Il punteggio di affidabilità: da 0 a 100, tre voci. I protesti TOLGONO punti.
 *
 *  - REDDITO VERIFICATO       +50  lo controlla lo staff sui documenti
 *  - NESSUN PROTESTO          +30  lo dichiara la persona; lo staff lo può VERIFICARE sul certificato dei protesti (il risultato prevale)
 *    protesti, o NON INDICATO  −30  «non indicato» vale come «sì»: va risposto
 *  - GARANTE o FIDEIUSSIONE   +20  lo dichiara la persona (non si verifica)
 *
 * Il totale può scendere sotto zero (protesti e niente altro): il punteggio mostrato non va sotto 0, ma il calcolo tiene il
 * numero vero (`grezzo`) per dire a quanto si può arrivare. Il principio dei pesi: conta di più ciò che si può verificare (il
 * reddito) di ciò che si dichiara (garante); e un protesto pesa quanto la sua assenza vale.
 *
 * Le RECENSIONI non fanno parte del punteggio: si mostrano a parte, accanto (vedi recensioni.ts).
 */
export type AffidabilitaInput = {
  verificato: boolean;
  protestato: boolean | null;
  garante: boolean | null;
  fideiussione: boolean | null;
  /** lo staff ha verificato i protesti sul certificato: `protestato` è allora il risultato dello staff */
  protestiVerificati?: boolean;
};

/** `protesti` è il peso della voce: +30 se non ne hai, −30 se ne hai o non hai risposto. */
export const PUNTI_AFFIDABILITA = { reddito: 50, protesti: 30, garanzia: 20 } as const;
export const PUNTEGGIO_MINIMO = 0;
export const PUNTEGGIO_MASSIMO = PUNTI_AFFIDABILITA.reddito + PUNTI_AFFIDABILITA.protesti + PUNTI_AFFIDABILITA.garanzia;

/**
 * Da quale punteggio in su vale ogni etichetta. Con queste soglie le sole dichiarazioni (al massimo 50: nessun protesto e
 * garante) non arrivano mai a «Molto buona»: ci vuole il reddito verificato. E con i protesti si arriva a «Buona» solo con
 * reddito verificato E garante.
 */
export const SOGLIE_ETICHETTA = { buona: 30, moltoBuona: 60, eccellente: 85 } as const;

export type EtichettaPunteggio = "Scarsa" | "Buona" | "Molto buona" | "Eccellente";

/** Una voce del punteggio: quanto vale, se l'hai presa, e come si sa (verificata dallo staff o dichiarata da te). */
export type VoceAffidabilita = {
  id: "reddito" | "protesti" | "garanzia";
  etichetta: string;
  /** i punti che dà oggi: positivi se l'hai presa, 0 se non è presa, NEGATIVI per i protesti (o il non averli indicati) */
  punti: number;
  /** quanto vale al massimo (in positivo) */
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
  /** da 0 a 100 */
  punteggio: number;
  /** la somma delle voci prima di fermarla a 0: può essere negativa (−30 se hai protesti e nient'altro) */
  grezzo: number;
  /** «Da completare» finché non hai risposto sui protesti: non è un giudizio, è una domanda senza risposta */
  label: EtichettaPunteggio | "Da completare";
  /** le tre voci, sempre nello stesso ordine */
  voci: VoceAffidabilita[];
};

export function etichettaPunteggio(punteggio: number): EtichettaPunteggio {
  if (punteggio >= SOGLIE_ETICHETTA.eccellente) return "Eccellente";
  if (punteggio >= SOGLIE_ETICHETTA.moltoBuona) return "Molto buona";
  if (punteggio >= SOGLIE_ETICHETTA.buona) return "Buona";
  return "Scarsa";
}

/** Le fasce di punteggio, con gli estremi: ricavate dalle soglie, così l'informativa non può contraddire la formula. */
export function fasceAffidabilita(): { label: EtichettaPunteggio; da: number; a: number }[] {
  const { buona, moltoBuona, eccellente } = SOGLIE_ETICHETTA;
  return [
    { label: "Scarsa", da: PUNTEGGIO_MINIMO, a: buona - 1 },
    { label: "Buona", da: buona, a: moltoBuona - 1 },
    { label: "Molto buona", da: moltoBuona, a: eccellente - 1 },
    { label: "Eccellente", da: eccellente, a: PUNTEGGIO_MASSIMO },
  ];
}

/** I casi tipici, dal migliore al peggiore, con il punteggio che dà e l'etichetta (ricavati dalle regole, non scritti a mano). */
export function esempiAffidabilita(): { descrizione: string; punteggio: number; label: AffidabilitaResult["label"] }[] {
  const no = false as const;
  const casi: [string, AffidabilitaInput][] = [
    ["Reddito verificato, nessun protesto, garante o fideiussione", { verificato: true, protestato: no, garante: true, fideiussione: null }],
    ["Reddito verificato e nessun protesto", { verificato: true, protestato: no, garante: null, fideiussione: null }],
    ["Nessun protesto e garante o fideiussione", { verificato: false, protestato: no, garante: true, fideiussione: null }],
    ["Solo nessun protesto", { verificato: false, protestato: no, garante: null, fideiussione: null }],
    ["Reddito verificato, protesti, garante o fideiussione", { verificato: true, protestato: true, garante: true, fideiussione: null }],
    ["Reddito verificato e protesti", { verificato: true, protestato: true, garante: null, fideiussione: null }],
    ["Protesti e garante o fideiussione", { verificato: false, protestato: true, garante: true, fideiussione: null }],
    ["Protesti e nient'altro", { verificato: false, protestato: true, garante: null, fideiussione: null }],
    ["Protesti non indicati", { verificato: false, protestato: null, garante: null, fideiussione: null }],
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

  // «sì» e «non indicato» valgono lo stesso: tolgono i punti. Solo il «non indicato» si può ancora correggere.
  const voceProtesti: VoceAffidabilita =
    p.protestato === false
      ? { id: "protesti", etichetta: "Nessun protesto", punti: protesti, massimo: protesti, presa: true, origine: p.protestiVerificati ? "verificato" : "dichiarato", potenziale: 0, suggerimento: null, sezione: null, nota: p.protestiVerificati ? "Controllato dallo staff sul tuo certificato dei protesti." : "Non ancora verificato: vale quanto hai dichiarato. Puoi far controllare il certificato dei protesti dallo staff." }
      : p.protestato === true
        ? { id: "protesti", etichetta: p.protestiVerificati ? "Protesti verificati" : "Protesti dichiarati", punti: -protesti, massimo: protesti, presa: false, origine: p.protestiVerificati ? "verificato" : "dichiarato", potenziale: 0, suggerimento: null, sezione: null, nota: p.protestiVerificati ? `Lo staff ha controllato il tuo certificato: risultano dei protesti. Tolgono ${protesti} punti.` : `Hai dichiarato dei protesti o segnalazioni: tolgono ${protesti} punti.` }
        : { id: "protesti", etichetta: "Protesti non indicati", punti: -protesti, massimo: protesti, presa: false, origine: "dichiarato", potenziale: 2 * protesti, suggerimento: "Indica i protesti nei tuoi dati", sezione: "dati", nota: `Non indicati: valgono come se ci fossero e tolgono ${protesti} punti.` };

  const haGaranzia = p.garante === true || p.fideiussione === true;
  const voceGaranzia: VoceAffidabilita = haGaranzia
    ? { id: "garanzia", etichetta: "Garante o fideiussione", punti: garanzia, massimo: garanzia, presa: true, origine: "dichiarato", potenziale: 0, suggerimento: null, sezione: null, nota: "Nessuno lo controlla: vale quanto hai dichiarato." }
    : { id: "garanzia", etichetta: "Garante o fideiussione", punti: 0, massimo: garanzia, presa: false, origine: "dichiarato", potenziale: garanzia, suggerimento: "Indica un garante o una fideiussione", sezione: "dati", nota: "Non indicato." };

  const voci = [voceReddito, voceProtesti, voceGaranzia];
  const grezzo = voci.reduce((somma, v) => somma + v.punti, 0);
  const punteggio = Math.max(PUNTEGGIO_MINIMO, Math.min(PUNTEGGIO_MASSIMO, grezzo));
  return { punteggio, grezzo, label: p.protestato === null ? "Da completare" : etichettaPunteggio(punteggio), voci };
}

/** Cosa si dice a chi salva i dati senza aver risposto sui protesti: la risposta è obbligatoria. */
export const MESSAGGIO_PROTESTI_OBBLIGATORI = "Indica se hai protesti o segnalazioni: serve per il punteggio di affidabilità.";

/** Il punteggio che si raggiungerebbe completando tutte le voci ottenibili (parte dal totale vero, anche se negativo). */
export function punteggioPossibile(r: Pick<AffidabilitaResult, "voci" | "punteggio"> & Partial<Pick<AffidabilitaResult, "grezzo">>): number {
  const partenza = typeof r.grezzo === "number" ? r.grezzo : r.punteggio;
  return Math.max(PUNTEGGIO_MINIMO, Math.min(PUNTEGGIO_MASSIMO, partenza + r.voci.reduce((somma, v) => somma + v.potenziale, 0)));
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
