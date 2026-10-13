/**
 * La scheda di ricerca: dallo stato salvato allo stato del modulo, e da questo a ciò che si manda al database.
 * Logica pura, senza rete né interfaccia, così si prova a fondo.
 *
 * Nel modulo i valori «nessun limite» sono numeri speciali (0 = qualsiasi, e il massimo del cursore del budget =
 * senza tetto): rendono semplici i controlli. Al salvataggio diventano `null`.
 */
import { ATTR_VOCAB, TIPI_CONTRATTO } from "./constants";
import { CLASSI_ENERGETICHE } from "./annunci/energia";
import { haCriteriDiRicerca } from "./match/mazzo";
import {
  CHIAVI_CON_VALORE,
  ETICHETTE_CON_VALORE,
  criteriDaInteressi,
  haValore,
  normalizzaCriteriRicerca,
  valoreValido,
} from "./match/criteri-ricerca";
import type { CriterioRicerca, ProfiloRicerca, ValoreCriterio } from "./match/tipi";

export const BUDGET = { min: 0, max: 3000, step: 50, predefinito: 1300 } as const;
export const LOCALI = { max: 10 } as const;
export const METRATURA = { min: 20, max: 300, step: 5 } as const;
export const IMPORTANZA_PREDEFINITA = 5;

export type StatoRicerca = {
  tipologia: "appartamento" | "villa";
  /** 0 = nessun minimo */
  budgetMin: number;
  /** BUDGET.max = senza tetto */
  budgetMax: number;
  /** 0 = qualsiasi, per tutti e quattro */
  localiMin: number;
  localiMax: number;
  mqMin: number;
  mqMax: number;
  luoghi: string[];
  criteri: CriterioRicerca[];
};

/** Dalla ricerca salvata allo stato del modulo. Senza nessun criterio parte da un budget di 1300, come sempre. */
export function statoDaRicerca(r: ProfiloRicerca): StatoRicerca {
  const ha = haCriteriDiRicerca(r);
  return {
    tipologia: r.tipologia === "villa" ? "villa" : "appartamento",
    budgetMin: r.budgetMin ?? 0,
    budgetMax: r.budgetMax ?? (ha ? BUDGET.max : BUDGET.predefinito),
    localiMin: r.localiMin ?? 0,
    localiMax: r.localiMax ?? 0,
    mqMin: r.mqMin ?? 0,
    mqMax: r.mqMax ?? 0,
    luoghi: [...(r.luoghi ?? [])],
    criteri: normalizzaCriteriRicerca(r.criteri !== undefined ? r.criteri : criteriDaInteressi(r.interessi)),
  };
}

/** Ciò che si manda a `salva_ricerca_inquilino`. */
export function ricercaPerSalvataggio(s: StatoRicerca) {
  return {
    tipologia: s.tipologia,
    budget_min: s.budgetMin > BUDGET.min ? s.budgetMin : null,
    budget_max: s.budgetMax < BUDGET.max ? s.budgetMax : null,
    locali_min: s.localiMin > 0 ? s.localiMin : null,
    locali_max: s.localiMax > 0 ? s.localiMax : null,
    mq_min: s.mqMin > 0 ? s.mqMin : null,
    mq_max: s.mqMax > 0 ? s.mqMax : null,
    luoghi: s.luoghi,
    criteri: s.criteri.map((c) => ({ chiave: c.chiave, necessaria: c.necessaria, peso: c.necessaria ? IMPORTANZA_PREDEFINITA : c.peso, valore: c.valore })),
  };
}

/** Il testo sopra i cursori del budget: «fino a €1.400», «da €900», «da €900 a €1.400», «nessun limite». */
export function testoBudget(min: number, max: number): string {
  const e = (n: number) => `€${n.toLocaleString("it-IT")}`;
  if (min <= BUDGET.min && max >= BUDGET.max) return "nessun limite";
  if (min <= BUDGET.min) return `fino a ${e(max)}`;
  if (max >= BUDGET.max) return `da ${e(min)}`;
  return `da ${e(min)} a ${e(max)}`;
}

/** Il primo problema che impedisce di salvare, o `null`. */
export function primoErrore(s: StatoRicerca): string | null {
  if (s.budgetMin > s.budgetMax) return "Il budget minimo non può superare il massimo.";
  if (s.localiMin > 0 && s.localiMax > 0 && s.localiMin > s.localiMax) return "I locali minimi non possono superare i massimi.";
  if (s.mqMin > 0 && s.mqMax > 0 && s.mqMin > s.mqMax) return "La metratura minima non può superare la massima.";
  for (const c of s.criteri) {
    if (haValore(c.chiave) && valoreValido(c.chiave, c.valore) === null) return `Controlla «${ETICHETTE_CON_VALORE[c.chiave]}»: manca un valore.`;
  }
  return null;
}

// ------------------------------------------------------------ le caratteristiche

export type Caratteristica = { chiave: string; etichetta: string; tipo: "si_no" | "valore" };

/** Tutte quelle che si possono aggiungere alla lista (il tipo di contratto ha una sezione sua). */
export const CARATTERISTICHE: readonly Caratteristica[] = [
  ...ATTR_VOCAB.map((a) => ({ chiave: a.key as string, etichetta: a.label, tipo: "si_no" as const })),
  ...CHIAVI_CON_VALORE.filter((k) => k !== "contratto").map((k) => ({ chiave: k as string, etichetta: ETICHETTE_CON_VALORE[k], tipo: "valore" as const })),
];

/** Il tipo di contratto ha una sezione sua: nella lista delle caratteristiche non compare. */
export const inElenco = (c: CriterioRicerca) => c.chiave !== "contratto";

/** Il valore con cui parte una caratteristica appena aggiunta. `oggi` è AAAA-MM-GG. */
export function valorePredefinito(chiave: string, oggi: string): ValoreCriterio | null {
  switch (chiave) {
    case "bagni":
      return { min: 2 };
    case "piano":
      return { min: null, max: 3 };
    case "riscaldamento":
      return { tipi: ["autonomo"] };
    case "contratto":
      return { tipi: [TIPI_CONTRATTO[0].id] };
    case "ingresso": {
      const d = new Date(`${oggi}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() + 30);
      return { entro: d.toISOString().slice(0, 10) };
    }
    case "classeEnergetica":
      return { classe: "C" };
    default:
      return null;
  }
}

export function criterioNuovo(chiave: string, oggi: string): CriterioRicerca {
  return { chiave, necessaria: false, peso: IMPORTANZA_PREDEFINITA, valore: valorePredefinito(chiave, oggi) };
}

/** Aggiunge una caratteristica (se non c'è già) senza toccare le altre. */
export function aggiungi(criteri: readonly CriterioRicerca[], chiave: string, oggi: string): CriterioRicerca[] {
  return criteri.some((c) => c.chiave === chiave) ? [...criteri] : [...criteri, criterioNuovo(chiave, oggi)];
}

export function rimuovi(criteri: readonly CriterioRicerca[], chiave: string): CriterioRicerca[] {
  return criteri.filter((c) => c.chiave !== chiave);
}

/** Cambia una caratteristica; se non c'è, non fa niente. */
export function modifica(criteri: readonly CriterioRicerca[], chiave: string, cambio: Partial<Pick<CriterioRicerca, "necessaria" | "peso" | "valore">>): CriterioRicerca[] {
  return criteri.map((c) => (c.chiave === chiave ? { ...c, ...cambio } : c));
}

/**
 * Sceglie o toglie un tipo in una caratteristica a elenco (riscaldamento, contratto). Se non c'era la aggiunge; se l'ultimo
 * tipo viene tolto, la caratteristica sparisce (un elenco vuoto non vuol dire niente).
 */
export function alternaTipo(criteri: readonly CriterioRicerca[], chiave: "riscaldamento" | "contratto", tipo: string): CriterioRicerca[] {
  const c = criteri.find((x) => x.chiave === chiave);
  if (!c) return [...criteri, { chiave, necessaria: false, peso: IMPORTANZA_PREDEFINITA, valore: { tipi: [tipo] } }];
  const tipi = c.valore?.tipi ?? [];
  const nuovi = tipi.includes(tipo) ? tipi.filter((t) => t !== tipo) : [...tipi, tipo];
  return nuovi.length === 0 ? rimuovi(criteri, chiave) : modifica(criteri, chiave, { valore: { tipi: nuovi } });
}

/** Le caratteristiche ancora da aggiungere. */
export function disponibili(criteri: readonly CriterioRicerca[]): Caratteristica[] {
  return CARATTERISTICHE.filter((c) => !criteri.some((x) => x.chiave === c.chiave));
}

/** Le opzioni dei piani nei menu: seminterrato, terra, 1°…10°. */
export const OPZIONI_PIANO: readonly { valore: number; etichetta: string }[] = [
  { valore: -1, etichetta: "Seminterrato" },
  { valore: 0, etichetta: "Terra" },
  ...Array.from({ length: 10 }, (_, i) => ({ valore: i + 1, etichetta: `${i + 1}°` })),
];

export const OPZIONI_CLASSE: readonly { classe: string; etichetta: string }[] = CLASSI_ENERGETICHE.map((c) => ({
  classe: c,
  etichetta: c === "A4" ? "A4 (la migliore)" : c === "G" ? "G (la peggiore)" : c,
}));
