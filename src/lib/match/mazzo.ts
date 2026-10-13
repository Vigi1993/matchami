import { calcolaMatchInquilino, ordinaAnnunci } from "./inquilino";
import { antenati, type MappaLuoghi } from "../luoghi";
import { haValore, normalizzaCriterioRicerca, ordinaCriteri } from "./criteri-ricerca";
import type {
  AnnuncioPerMatch,
  CriterioRicerca,
  Fascia,
  ProfiloRicerca,
  RisultatoInquilino,
  Tipologia,
} from "./tipi";

/** Le colonne di ricerca di `tenant_profiles`, come arrivano dal database. */
export type RigaRicerca = {
  budget_max: number | null;
  locali_min: number | null;
  mq_min: number | null;
  budget_min?: number | null;
  locali_max?: number | null;
  mq_max?: number | null;
  tipologia?: string | null;
};

/** Una riga di `tenant_zone_interesse`. */
export type RigaZona = { zona: string; luogo_id?: string | null };

/** Una riga di `tenant_interessi`. */
export type RigaInteresse = { attributo_key: string; peso: number; valore?: unknown; necessaria?: boolean | null };

const TIPOLOGIE_NOTE: readonly string[] = ["appartamento", "villa", "posto_letto"];

/**
 * Dai dati salvati ai criteri di ricerca che il calcolo legge. Un valore
 * 0 o vuoto vale "nessuna preferenza", come nel filtro che c'era prima.
 */
export function profiloRicercaDaRighe(
  riga: RigaRicerca,
  zone: RigaZona[] | null | undefined,
  interessi: RigaInteresse[] | null | undefined
): ProfiloRicerca {
  const criteri: CriterioRicerca[] = [];
  for (const r of interessi ?? []) {
    // una riga vecchia (senza valore né «necessaria») è una caratteristica opzionale sì/no
    const c = normalizzaCriterioRicerca({ chiave: r.attributo_key, peso: r.peso, necessaria: r.necessaria === true, valore: r.valore ?? null });
    if (c && !criteri.some((x) => x.chiave === c.chiave)) criteri.push(c);
  }
  const ordinati = ordinaCriteri(criteri);
  return {
    budgetMax: riga.budget_max || null,
    localiMin: riga.locali_min || null,
    mqMin: riga.mq_min || null,
    zone: (zone ?? []).map((z) => z.zona),
    // gli interessi sì/no e opzionali, nella forma vecchia (per chi non conosce i criteri nuovi)
    interessi: Object.fromEntries(ordinati.filter((c) => !c.necessaria && !haValore(c.chiave)).map((c) => [c.chiave, c.peso])),
    budgetMin: riga.budget_min || null,
    localiMax: riga.locali_max || null,
    mqMax: riga.mq_max || null,
    tipologia: riga.tipologia && TIPOLOGIE_NOTE.includes(riga.tipologia) ? (riga.tipologia as Tipologia) : null,
    luoghi: (zone ?? []).map((z) => z.luogo_id).filter((id): id is string => typeof id === "string"),
    criteri: ordinati,
  };
}

/**
 * I campi dell'annuncio che il calcolo legge, dalla riga del database: i luoghi che lo contengono (per sapere se è
 * in una zona cercata) e i dati nuovi. Da unire all'annuncio prima di calcolare il match.
 */
export function campiMatchDaRiga(
  riga: {
    luogo_id?: string | null;
    tipologia?: string | null;
    bagni?: number | null;
    piano?: number | null;
    riscaldamento?: string | null;
    tipo_contratto?: string | null;
    disponibile_dal?: string | null;
    classe_energetica?: string | null;
  },
  mappa: MappaLuoghi
): Pick<AnnuncioPerMatch, "antenati" | "tipologia" | "bagni" | "piano" | "riscaldamento" | "tipoContratto" | "disponibileDal" | "classeEnergetica"> {
  return {
    antenati: antenati(riga.luogo_id ?? null, mappa),
    tipologia: riga.tipologia && TIPOLOGIE_NOTE.includes(riga.tipologia) ? (riga.tipologia as Tipologia) : null,
    bagni: riga.bagni ?? null,
    piano: riga.piano ?? null,
    riscaldamento: riga.riscaldamento ?? null,
    tipoContratto: riga.tipo_contratto ?? null,
    disponibileDal: riga.disponibile_dal ?? null,
    classeEnergetica: riga.classe_energetica ?? null,
  };
}

export type VoceMazzo<T> = T & { match: RisultatoInquilino };

export type Mazzo<T> = {
  /** annunci da mostrare, già in ordine: prima in ricerca, poi gli altri */
  mazzo: VoceMazzo<T>[];
  /** quanti annunci del mazzo (i primi) sono in ricerca */
  inRicerca: number;
  /** annunci tolti perché oltre la tolleranza sul budget, o per un criterio necessario, o per la tipologia */
  esclusi: number;
  /** di quelli, quanti non rispettano una caratteristica NECESSARIA (la Home lo dice) */
  nascostiPerNecessarie: number;
};

/**
 * L'inquilino ha impostato almeno un criterio di ricerca?
 *
 * Senza criteri ogni annuncio prende lo stesso punteggio pieno e la
 * percentuale non dice nulla: l'interfaccia non deve mostrarla.
 */
export function haCriteriDiRicerca(profilo: ProfiloRicerca): boolean {
  return (
    profilo.budgetMax !== null ||
    profilo.localiMin !== null ||
    profilo.mqMin !== null ||
    profilo.zone.length > 0 ||
    Object.keys(profilo.interessi).length > 0 ||
    (profilo.budgetMin ?? null) !== null ||
    (profilo.localiMax ?? null) !== null ||
    (profilo.mqMax ?? null) !== null ||
    (profilo.luoghi?.length ?? 0) > 0 ||
    (profilo.criteri?.length ?? 0) > 0
  );
}

/**
 * Dagli annunci pubblicati al mazzo dell'inquilino: calcola il match di
 * ciascuno, toglie quelli oltre la tolleranza sul budget e ordina.
 * Gli annunci conservano tutti i loro campi, con `match` in più.
 */
export function preparaMazzo<T extends AnnuncioPerMatch>(
  annunci: T[],
  profilo: ProfiloRicerca
): Mazzo<T> {
  const voci: VoceMazzo<T>[] = annunci.map((a) => ({
    ...a,
    match: calcolaMatchInquilino(a, profilo),
  }));

  const mazzo = ordinaAnnunci(voci);

  return {
    mazzo,
    inRicerca: mazzo.filter((v) => v.match.fascia === "in_ricerca").length,
    esclusi: voci.length - mazzo.length,
    nascostiPerNecessarie: voci.filter((v) => v.match.fascia === "escluso" && v.match.motiviEsclusione.includes("necessaria")).length,
  };
}

export type StatoMazzo = {
  /** annunci in ricerca: sono i primi del mazzo */
  inRicerca: number;
  /** annunci della fascia "oltre la ricerca": vengono dopo */
  oltre: number;
  finito: boolean;
  /** va mostrata la schermata di passaggio tra le due fasce */
  mostraSeparatore: boolean;
};

/**
 * Dove si trova il deck: serve a decidere cosa mostrare, in particolare
 * quando comparire la schermata di passaggio tra "in linea con la tua
 * ricerca" e "oltre la tua ricerca".
 *
 * Il separatore compare quando l'indice arriva al primo annuncio della
 * seconda fascia, anche all'inizio se nessun annuncio è in ricerca, e
 * solo finché l'inquilino non l'ha superato.
 */
export function statoMazzo(
  fasce: Fascia[],
  indice: number,
  opzioni: { mostraMatch: boolean; separatoreVisto: boolean }
): StatoMazzo {
  const inRicerca = fasce.filter((f) => f === "in_ricerca").length;
  const oltre = fasce.length - inRicerca;
  const finito = indice >= fasce.length;

  return {
    inRicerca,
    oltre,
    finito,
    mostraSeparatore:
      opzioni.mostraMatch &&
      !finito &&
      !opzioni.separatoreVisto &&
      oltre > 0 &&
      indice === inRicerca,
  };
}
