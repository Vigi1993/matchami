/**
 * Il percorso di BENVENUTO dopo l'iscrizione: una serie di schede che chiedono i dati che servono, diverse per l'inquilino e per il proprietario.
 * Logica pura, senza database: si prova con `npm test`. Le regole vere (cosa serve per completare) le controlla il database (migrazione 0039,
 * funzione completa_onboarding): qui si evita di far fare alla persona cose che il database rifiuterebbe.
 *
 * Alcune schede sono OBBLIGATORIE (i dati essenziali: senza non si entra); le altre (foto, documenti, verifiche, famiglia) si propongono ma si possono
 * fare dopo. Non si può saltare avanti oltre una scheda obbligatoria non completata, nemmeno cambiando l'indirizzo.
 */

export type Ruolo = "inquilino" | "proprietario";

export type PassoInquilino = "intro" | "persona" | "reddito" | "garanzie" | "ricerca" | "documenti";
export type PassoProprietario = "intro" | "identita" | "casa" | "prova";
export type PassoId = PassoInquilino | PassoProprietario;

export type Passo = {
  id: PassoId;
  titolo: string;
  /** una frase che dice cosa si chiede e perché */
  descrizione: string;
  /** senza questa scheda non si entra */
  obbligatorio: boolean;
  /** i dati di questa scheda ci sono già */
  completo: boolean;
  /** il testo del pulsante per andare avanti, se non è il solito «Avanti» / «Lo faccio dopo» */
  azione?: string;
};

/** Ciò che serve sapere dell'inquilino per decidere a che punto è. */
export type DatiBenvenutoInquilino = {
  professione: string | null;
  redditoMensile: number | null;
  protestato: boolean | null;
  budgetMax: number | null;
  /** i tipi dei documenti già caricati («identita», «reddito», «protesti») */
  documenti: readonly string[];
};

/** Ciò che serve sapere del proprietario. */
export type DatiBenvenutoProprietario = {
  /** quanti immobili ha già creato */
  nImmobili: number;
  haIdentita: boolean;
  /** la prova di proprietà (visura, atto) del suo primo immobile */
  haProva: boolean;
};

const pieno = (v: string | null | undefined): boolean => typeof v === "string" && v.trim().length > 0;
const positivo = (v: number | null | undefined): boolean => typeof v === "number" && Number.isFinite(v) && v > 0;

export function passiInquilino(d: DatiBenvenutoInquilino): Passo[] {
  return [
    {
      id: "intro",
      titolo: "Come funziona",
      descrizione: "Cosa vuol dire match e affidabilità, e perché conta caricare i documenti. Si legge in un minuto.",
      obbligatorio: false,
      // chi ha già cominciato a compilare non rivede la spiegazione ogni volta che rientra
      completo: pieno(d.professione),
      azione: "Ho capito, cominciamo",
    },
    {
      id: "persona",
      titolo: "Chi sei",
      descrizione: "La tua foto e il tuo lavoro: i proprietari li vedono per primi.",
      obbligatorio: true,
      completo: pieno(d.professione),
    },
    {
      id: "reddito",
      titolo: "Reddito e famiglia",
      descrizione: "Quanto guadagni e chi vivrà con te. Aiuta a trovare la casa giusta.",
      obbligatorio: false,
      completo: positivo(d.redditoMensile),
    },
    {
      id: "garanzie",
      titolo: "Garanzie e protesti",
      descrizione: "Un garante o una fideiussione, e se hai protesti. Il nostro staff può verificarlo.",
      obbligatorio: true,
      completo: d.protestato !== null,
    },
    {
      id: "ricerca",
      titolo: "La tua ricerca",
      descrizione: "Che casa cerchi: budget, zone, locali e ciò che conta per te.",
      obbligatorio: true,
      completo: positivo(d.budgetMax),
    },
    {
      id: "documenti",
      titolo: "I tuoi documenti",
      descrizione: "Il documento d'identità e, se vuoi, la prova del reddito e il certificato dei protesti: il nostro staff li controlla e il tuo profilo vale di più. Puoi farlo anche dopo.",
      obbligatorio: false,
      completo: d.documenti.includes("identita"),
    },
  ];
}

export function passiProprietario(d: DatiBenvenutoProprietario): Passo[] {
  return [
    {
      id: "intro",
      titolo: "Come funziona",
      descrizione: "Cosa vuol dire match e affidabilità, e perché conta verificare la tua casa. Si legge in un minuto.",
      obbligatorio: false,
      completo: d.nImmobili > 0 || d.haIdentita,
      azione: "Ho capito, cominciamo",
    },
    {
      id: "identita",
      titolo: "I tuoi documenti",
      descrizione: "Un documento d'identità: serve a verificare che la casa è tua. Lo vede solo il team di MatchAmI. Puoi farlo anche dopo.",
      obbligatorio: false,
      completo: d.haIdentita,
    },
    {
      id: "casa",
      titolo: "La tua casa",
      descrizione: "Dove si trova, quanto costa, le foto e le caratteristiche: è ciò che vedranno gli inquilini.",
      obbligatorio: true,
      completo: d.nImmobili > 0,
    },
    {
      id: "prova",
      titolo: "Prova di proprietà",
      descrizione: "La visura catastale o l'atto: il nostro staff li controlla e la tua casa risulta verificata. Puoi farlo anche dopo.",
      obbligatorio: false,
      completo: d.haProva,
    },
  ];
}

/** Fino a dove si può arrivare: la prima scheda obbligatoria non completata (o l'ultima se sono tutte a posto). Non si salta oltre. */
export function limitePasso(passi: readonly Passo[]): number {
  const i = passi.findIndex((p) => p.obbligatorio && !p.completo);
  return i === -1 ? passi.length - 1 : i;
}

/**
 * La scheda da mostrare: quella chiesta (dall'indirizzo) se esiste e se ci si può arrivare; senza richiesta, la prima non ancora completata
 * (o l'ultima se è tutto a posto). Una richiesta oltre il limite torna al limite; una richiesta non valida viene ignorata.
 */
export function passoDaMostrare(passi: readonly Passo[], richiesto: unknown): number {
  const limite = limitePasso(passi);
  if (typeof richiesto === "string" && /^\d+$/.test(richiesto)) {
    const n = Number(richiesto) - 1; // nell'indirizzo i passi si contano da 1
    if (n >= 0 && n < passi.length) return Math.min(n, limite);
  }
  const prima = passi.findIndex((p) => !p.completo);
  return Math.min(prima === -1 ? passi.length - 1 : prima, limite);
}

/** Si può entrare nell'app solo con tutte le schede obbligatorie a posto. */
export function puoFinire(passi: readonly Passo[]): boolean {
  return passi.every((p) => !p.obbligatorio || p.completo);
}

/** Si può andare alla scheda dopo: sempre per quelle facoltative, solo a dati salvati per quelle obbligatorie. */
export function puoAndareAvanti(passo: Passo): boolean {
  return !passo.obbligatorio || passo.completo;
}

/** L'indirizzo di una scheda (i passi si contano da 1). */
export function indirizzoPasso(indice: number): string {
  return `/benvenuto?passo=${indice + 1}`;
}

export function testoProgresso(indice: number, totale: number): string {
  return `Passo ${indice + 1} di ${totale}`;
}

/** Quanto è piena la barra dei passi (0-100): conta il passo in cui si è. */
export function percentualeProgresso(indice: number, totale: number): number {
  if (totale <= 0) return 0;
  return Math.round(((indice + 1) / totale) * 100);
}

export const TESTI_BENVENUTO = {
  titolo: "Benvenuto in MatchAmI",
  saluto: (nome: string | null): string => (nome && nome.trim() ? `Benvenuto, ${nome.trim()}` : "Benvenuto"),
  introInquilino: "Qualche domanda per trovarti la casa giusta. Ci vogliono pochi minuti.",
  introProprietario: "Qualche passo per mettere online la tua casa. Ci vogliono pochi minuti.",
  indietro: "Indietro",
  avanti: "Avanti",
  saltaPerOra: "Lo faccio dopo",
  finisci: "Entra in MatchAmI",
  obbligatorio: "Questa scheda serve per continuare.",
  facoltativo: "Puoi saltare questa scheda e farla dopo.",
} as const;

/** Dall'errore del database alle parole per la persona. */
export function messaggioErroreBenvenuto(messaggio: unknown): string {
  const m = typeof messaggio === "string" ? messaggio : "";
  if (m.includes("ONBOARDING_LAVORO_MANCANTE")) return "Manca la tua situazione lavorativa: torna alla scheda «Chi sei».";
  if (m.includes("PROTESTI_NON_DICHIARATI")) return "Manca la risposta sui protesti: torna alla scheda «Garanzie e protesti».";
  if (m.includes("ONBOARDING_BUDGET_MANCANTE")) return "Manca il budget massimo: torna alla scheda «La tua ricerca».";
  if (m.includes("ONBOARDING_NESSUN_IMMOBILE")) return "Prima aggiungi la tua casa, nella scheda «La tua casa».";
  if (m.includes("NON_AUTENTICATO")) return "Accedi di nuovo per continuare.";
  return "Non sono riuscito a completare. Riprova.";
}
