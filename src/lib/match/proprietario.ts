import {
  SOGLIA_PROFILO_COMPLETO,
  SOGLIA_REDDITO_CANONE,
} from "./config";
import { etichettaPer, limita, pesoValido } from "./comuni";
import type {
  ChiaveCriterio,
  CriterioRichiesto,
  DatiCandidato,
  RisultatoProprietario,
  StatoCriterio,
  VoceCriterio,
} from "./tipi";

const EPS = 1e-9;

type Contesto = {
  canone: number;
  sogliaPct: number;
};

type Esito = { stato: StatoCriterio; dettaglio?: string };

type DefinizioneCriterio = {
  /** testo per l'interfaccia, anche nel modulo del proprietario */
  nome: string;
  descrizione: string;
  etichetta: (ctx: Contesto) => string;
  valuta: (c: DatiCandidato, ctx: Contesto) => Esito;
};

/**
 * Il catalogo dei criteri che un proprietario può chiedere (D5).
 *
 * Aggiungerne uno significa aggiungere una voce qui e il suo tipo in
 * `ChiaveCriterio`. NON ci sono criteri sulla composizione familiare
 * (figli, numero di persone nel nucleo): è una scelta deliberata, vedi
 * il difetto 4 del documento. Anche "nessun animale" resta fuori finché
 * non lo valuta un legale.
 */
export const CATALOGO_CRITERI: Record<ChiaveCriterio, DefinizioneCriterio> = {
  redditoCanone: {
    nome: "Reddito rispetto al canone",
    descrizione:
      "Il canone non supera una certa percentuale del reddito mensile del nucleo.",
    etichetta: ({ sogliaPct }) => `Canone entro il ${sogliaPct}% del reddito`,
    valuta: (c, { canone, sogliaPct }) => {
      if (c.redditoMensileNucleo === null) return { stato: "non_indicato" };
      if (c.redditoMensileNucleo <= 0) {
        return { stato: "no", dettaglio: "Reddito non positivo" };
      }
      const peso = (canone / c.redditoMensileNucleo) * 100;
      return {
        stato: peso <= sogliaPct + EPS ? "ok" : "no",
        dettaglio: `Il canone pesa il ${Math.round(peso)}% sul reddito`,
      };
    },
  },

  garante: {
    nome: "Garante o fideiussione",
    descrizione: "Il candidato ha un garante oppure una fideiussione.",
    etichetta: () => "Garante o fideiussione disponibile",
    valuta: (c) => {
      if (c.garante === true || c.fideiussione === true) return { stato: "ok" };
      if (c.garante === false && c.fideiussione === false) {
        return { stato: "no" };
      }
      return { stato: "non_indicato" };
    },
  },

  profiloVerificato: {
    nome: "Profilo verificato",
    descrizione: "Il reddito è stato verificato con documenti.",
    etichetta: () => "Profilo verificato con documenti",
    // `verificato` non è mai "non indicato": o è stato verificato o no.
    valuta: (c) =>
      c.verificato
        ? { stato: "ok" }
        : { stato: "no", dettaglio: "Verifica non ancora effettuata" },
  },

  profiloCompleto: {
    nome: "Profilo completo",
    descrizione: "Il candidato ha compilato quasi tutti i campi del profilo.",
    etichetta: () => "Presentazione e profilo completi",
    valuta: (c) => ({
      stato: c.completezza >= SOGLIA_PROFILO_COMPLETO ? "ok" : "no",
      dettaglio: `${Math.round(c.completezza)}% dei campi compilati`,
    }),
  },

  nessunProtesto: {
    nome: "Nessun protesto",
    descrizione: "Il candidato dichiara di non avere protesti.",
    etichetta: () => "Nessun protesto dichiarato",
    valuta: (c) => {
      if (c.protestato === null) return { stato: "non_indicato" };
      return { stato: c.protestato ? "no" : "ok" };
    },
  },
};

export const CHIAVI_CRITERI = Object.keys(CATALOGO_CRITERI) as ChiaveCriterio[];

export function sogliaValida(sogliaPct: number | undefined): number {
  const { predefinita, min, max } = SOGLIA_REDDITO_CANONE;
  if (sogliaPct === undefined || !Number.isFinite(sogliaPct)) return predefinita;
  return Math.max(min, Math.min(max, Math.round(sogliaPct)));
}

/**
 * Quanto un candidato risponde ai criteri che il proprietario ha chiesto
 * per un annuncio.
 *
 * La percentuale è la quota di peso dei criteri soddisfatti sul peso
 * totale, TUTTI i criteri richiesti contano, ciascuno col suo peso.
 * In più, un criterio può essere obbligatorio: se manca, il candidato
 * risulta `bloccato`, ma la percentuale resta calcolata e visibile.
 *
 * Un dato non indicato dal candidato conta come criterio non
 * soddisfatto, ma si presenta come "non indicato" e non come "no": chi
 * compila il profilo sa che può salire.
 *
 * Senza nessun criterio richiesto la percentuale è `null`: non c'è nulla
 * da confrontare.
 */
export function calcolaMatchProprietario(
  richiesti: CriterioRichiesto[],
  candidato: DatiCandidato,
  canone: number
): RisultatoProprietario {
  const viste = new Set<ChiaveCriterio>();
  const criteri: VoceCriterio[] = [];
  const mancanti: string[] = [];
  let totale = 0;
  let ottenuto = 0;
  let incompleto = false;

  for (const r of richiesti) {
    const def = CATALOGO_CRITERI[r.chiave];
    // una riga con una chiave che non esiste più nel catalogo, o ripetuta,
    // si ignora invece di far fallire l'intero calcolo
    if (!def || viste.has(r.chiave)) continue;
    viste.add(r.chiave);

    const ctx: Contesto = { canone, sogliaPct: sogliaValida(r.sogliaPct) };
    const peso = pesoValido(r.peso);
    const esito = def.valuta(candidato, ctx);
    const etichetta = def.etichetta(ctx);
    const obbligatorio = r.modo === "obbligatorio";

    totale += peso;
    if (esito.stato === "ok") ottenuto += peso;
    if (esito.stato === "non_indicato") incompleto = true;
    if (obbligatorio && esito.stato !== "ok") mancanti.push(etichetta);

    criteri.push({
      chiave: r.chiave,
      etichetta,
      stato: esito.stato,
      dettaglio: esito.dettaglio,
      obbligatorio,
    });
  }

  if (totale === 0) {
    return {
      punteggio: null,
      etichetta: null,
      bloccato: false,
      mancanti: [],
      criteri: [],
      incompleto: false,
    };
  }

  const punteggio = limita((ottenuto / totale) * 100);

  return {
    punteggio,
    etichetta: etichettaPer(punteggio),
    bloccato: mancanti.length > 0,
    mancanti,
    criteri,
    incompleto,
  };
}

export type VoceCandidato = {
  match: RisultatoProprietario;
  /** punteggio di affidabilità, solo per gli spareggi (D4) */
  affidabilita: number | null;
};

/**
 * Ordine dei candidati di un annuncio: prima chi soddisfa tutti i
 * criteri obbligatori, poi per percentuale decrescente, e a parità per
 * affidabilità decrescente.
 *
 * L'affidabilità qui NON entra nella percentuale: è una proprietà della
 * persona, uguale per ogni casa, e si usa solo per decidere tra pari.
 */
export function confrontaCandidati(
  a: VoceCandidato,
  b: VoceCandidato
): number {
  if (a.match.bloccato !== b.match.bloccato) return a.match.bloccato ? 1 : -1;

  const pa = a.match.punteggio ?? -1;
  const pb = b.match.punteggio ?? -1;
  if (pa !== pb) return pb - pa;

  return (b.affidabilita ?? -1) - (a.affidabilita ?? -1);
}

export function ordinaCandidati<T extends VoceCandidato>(voci: T[]): T[] {
  return [...voci].sort(confrontaCandidati);
}
